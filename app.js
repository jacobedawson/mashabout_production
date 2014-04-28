var express = require('express'),
	http = require('http'),
	app = express(),
	//create HTTP server, register socket.io as listener. 
	server = http.createServer(app),
	io = require('socket.io').listen(server),
	mongoose = require('mongoose'),
	// usernames which are currently connected to the chat
	users = {};
	
	//express compress middleware
	app.use(express.compress());

	//Add static middleware to serve static content
	app.use(express.static(__dirname + '/public'));

	//ask server to listen on available port
	server.listen(process.env.PORT || 3000);

	// We define the key of the cookie containing the Express SID
	var EXPRESS_SID_KEY = 'express.sid';

	// We define a secret string used to crypt the cookies sent by Express
	var COOKIE_SECRET = 'some super secret string';
	var cookieParser = express.cookieParser(COOKIE_SECRET);

	// Create a new store in memory for the Express sessions
	var sessionStore = new express.session.MemoryStore();

	// Configure Express app with :
	// * Cookie Parser created above
	// * Configure Session Store
	app.configure(function () {
	    app.use(cookieParser);
	    app.use(express.session({
	        store: sessionStore,
	        cookie: { 
	            httpOnly: true
	        },
	        key: EXPRESS_SID_KEY
	    }));
	});

	// We configure the socket.io authorization handler (handshake)
		io.set('authorization', function (data, callback) {
		    if(!data.headers.cookie) {
		        return callback('No cookie transmitted.', false);
		    }

		    	// We use the Express cookieParser created before to parse the cookie
			    // Express cookieParser(req, res, next) is used initialy to parse data in "req.headers.cookie".
			    // Here our cookies are stored in "data.headers.cookie", so we just pass "data" to the first argument of function
		    cookieParser(data, {}, function(parseErr) {
		        if(parseErr) { return callback('Error parsing cookies.', false); }

		        	// Get the SID cookie
			        var sidCookie = (data.secureCookies && data.secureCookies[EXPRESS_SID_KEY]) ||
			                        (data.signedCookies && data.signedCookies[EXPRESS_SID_KEY]) ||
			                        (data.cookies && data.cookies[EXPRESS_SID_KEY]);

			        // Then we just need to load the session from the Express Session Store
        		sessionStore.load(sidCookie, function(err, session) {
                // If you want, you can attach the session to the handshake data, so you can use it again later
                // You can access it later with "socket.handshake.session"
                data.session = session;

                callback(null, true);
            
        });
    });
});





//connect to database at location, log error or log success
//following line edited for modulus testing, can be wound back
	mongoose.connect('mongodb://root:bamboo@novus.modulusmongo.net:27017/puvE7muz', function(err) {
	if(err) {
		console.log(err);
	} else {
		console.log('connected to mongodb!');
	}
});

/* 
###Area Above This unique to environment###
*/
Schema = mongoose.Schema;

//create a mongoose schema for the chat
var chatSchema = new Schema({
	nick: String,
	msg: String,
	created: {type: Date, default: Date.now}
});

//create a mongoose schema for user management i.e. logins and passwords
//contained in the file 'user.js'
var usermodel = require(__dirname + '/models/user.js');

var Chat = mongoose.model('Message', chatSchema);

// Configure routes
app.get('/', function(req, res){
	res.sendfile(__dirname + '/index.html');
	//set a session on login
	/*req.session.isLogged = true;*/
});

io.sockets.on('connection', function(socket){

	//sort old messages
	var query = Chat.find({});
	//reverse the order (most recent at bottom of window)
	query.sort('-created').limit(500).exec(function(err, docs) {
		if(err) throw err;
		socket.emit('load old msgs', docs);
	});
 	
 	//function to perform when new user connects	
	socket.on('new user', function(data, callback) {
		if(data in users) {
			callback(false);
		} else {
			callback(true);
			socket.nickname = data;
			users[socket.nickname] = socket;
			updateNicknames();
		}
		app.get('/', function(req, res){
			res.sendfile(__dirname + '/index.html');
			//set a session on login
			/*req.session.isLogged = true;*/
		});
	});


	function updateNicknames() {
		io.sockets.emit('usernames', Object.keys(users));
	}

	//create regular expression to look for img extensions
	var myRegEx = new RegExp("^(https?|ftp)://.*(jpeg|png|jpg|gif|bmp)");

	socket.on('send message', function(data, pm, callback){
		var msg = data.trim();

			//check regular expression against message, append img tags where appropriate
			if(myRegEx.test(msg)) {
				msg = '<img src=\"' + msg + '\"\/>';
			}


			//checks for links, adds anchor tags
			if (msg.substring(0,7) === 'http://' || msg.substring(0,8) === 'https://') {
				msg = '<a href=\"' + msg + '\" target=\"_blank\">' + msg + '</a>';
			}

			
				//deal with secret messages
				var name = pm;
				//prevent people messaging themselves UPDATE: (no longer needed actually...)
				if(users[name] === users[socket.nickname]) {
					users[socket.nickname].emit('error', {msg: "lol u just tried 2 message urself haha get some sleep yo ;)", nick: socket.nickname});
					return;
				}
				//prevent sending empty messages
				if(name in users) {
					if(msg.length == 0) { 
						return; 
					}

					//send private message
					users[name].emit('private', {msg: msg, nick: socket.nickname, to: pm, created: new Date()});
					users[socket.nickname].emit('private', {msg: msg, nick: socket.nickname, to: pm, created: new Date()});
				} else {
					//send public message
					var newMsg = new Chat({msg: msg, nick: socket.nickname});
					newMsg.save(function(err) {
						if(err) throw err;
						if(msg.length == 0) { 
							return; 
					}
					//if there is only 1 user online
					if(Object.keys(users).length <= 1) {
						msg = "<b>Ain\'t nobody else here, player :(</b><br><img src=\"http://static.nme.com/images/tumbleweed01.jpg\"/><b>You should *totes* invite someone else.<br>Don\'t leave me hanging on like a solo...</b>";
					}
				io.sockets.emit('new message', {msg: msg, nick: socket.nickname, to: pm, created: new Date()});
			});	
		}
		

	});




	socket.on('disconnect', function(data) {
		if(!socket.nickname) return;
		delete users[socket.nickname];
		updateNicknames();
	});
});