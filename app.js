var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
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

// routing
app.get('/', function(req, res){
	res.sendfile(__dirname + '/index.html');
});

io.sockets.on('connection', function(socket){
	var query = Chat.find({});
	query.sort('-created').limit(50).exec(function(err, docs) {
		if(err) throw err;
		socket.emit('load old msgs', docs);
	});
 		
	socket.on('new user', function(data, callback) {
		if(data in users) {
			callback(false);
		} else {
			callback(true);
			socket.nickname = data;
			users[socket.nickname] = socket;
			updateNicknames();
		}
	});





	function updateNicknames() {
		io.sockets.emit('usernames', Object.keys(users));
	}

	//create regular expression to look for img extensions
	var myRegEx = new RegExp("^(https?|ftp)://.*(jpeg|png|jpg|gif|bmp)");

	socket.on('send message', function(data, pm, callback){
		var msg = data.trim();
			//add html tags to imgs #problem - converts all links to images, need type check somehow
			/*if(msg.substring(0,7) === 'http://' && msg.substring(msg.length - 4) === '.gif') {
			    msg = '<img src=\"' + msg + '\"\/>';
			} */

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
					users[name].emit('private', {msg: msg, nick: socket.nickname, to: pm});
					users[socket.nickname].emit('private', {msg: msg, nick: socket.nickname, to: pm});
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
				io.sockets.emit('new message', {msg: msg, nick: socket.nickname, to: pm});
			});	
		}
		

	});




	socket.on('disconnect', function(data) {
		if(!socket.nickname) return;
		delete users[socket.nickname];
		updateNicknames();
	});
});