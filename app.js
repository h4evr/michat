
/**
 * Module dependencies.
 */

var webSocketServer = require('websocket').server,
    http = require('http');

var port = process.env.PORT || 3000;

var server = http.createServer(function() {}).listen(port, function () {
    console.log((new Date()) + " Server listening on port " + port);
});

var wsServer = new webSocketServer({
    httpServer: server
});

var connections = [],
    rooms = {};

function sendMessage(room, msg) {
    var utfMsg = JSON.stringify(msg);
    console.log("Sending message: ", utfMsg);
    for (var i = 0, len = room.length; i < len; ++i) {
        room[i].connection.sendUTF(utfMsg);
    }
}

function getRoomMembers(room) {
    var members = [],
        roomObj = rooms[room];

    for (var i = 0, len = roomObj.length; i < len; ++i) {
        members.push(roomObj[i].username);
    }

    return members;
}

var Actions = {
    'identify': function (client, msg) {
        client.username = msg.username;
    },

    'join': function (client, msg) {
        var room = msg.room;

        client.rooms.push(room);
        if (rooms[room] === undefined) {
            rooms[room] = [ client ];
        } else {
            rooms[room].push(client);
        }

        client.connection.sendUTF(JSON.stringify({
            type: 'members',
            users: getRoomMembers(room),
            room: room
        }));

        sendMessage(rooms[room], {
            type: "login",
            username: client.username,
            room: room
        });
    },

    'leave': function (client, msg) {
        var room = msg.room;

        var index = client.rooms.indexOf(room);
        if (index == -1) {
            client.connection.sendUTF(JSON.stringify({
                type: 'error',
                message: 'User is not subscribed to room ' + room
            }));
            return;
        }

        var roomObj = rooms[room];

        sendMessage(roomObj, {
            type: "logout",
            username: client.username,
            room: room
        });

        client.rooms.splice(index, 1);
        roomObj.splice(roomObj.indexOf(client), 1);
    },

    'broadcast': function (client, msg) {
        var room = msg.room;

        if (rooms[room] === undefined) {
            client.connection.sendUTF(JSON.stringify({
                type: 'error',
                message: 'Room does not exist. Join first to create it.'
            }));
            return;
        }

        sendMessage(rooms[room], {
            type: 'broadcast',
            room: room,
            username: client.username,
            message: msg.message,
            timestamp: new Date()
        });
    },

    'logout': function (client) {
        for (var i = 0, len = client.rooms; i < len; ++i) {
            var room = rooms[client.rooms[i]];
            sendMessage(room, {
                type: "logout",
                username: client.username
            });
            room.splice(room.indexOf(client), 1);
        }
        client.rooms = [];
    }
};


wsServer.on('request', function (req) {
    console.log("Received request from " + req.origin);

    var connection = req.accept(null, req.origin),
        client = {
            rooms: [],
            username: null,
            connection: connection
        },
        index = connections.push(client) - 1;

    console.log("Connection accepted.");

    connection.on("message", function (message) {
        if (message.type === 'utf8') {
            var msg = JSON.parse(message.utf8Data);

            if (Actions[msg.type] !== undefined) {
                Actions[msg.type](client, msg);
            } else {
                connection.sendUTF(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message type'
                }));
            }
        }
    });

    connection.on("close", function (connection) {
        console.log("Peer disconnected: " + connection.remoteAddress);
        Actions.logout(client);
        connections.splice(index, 1);
    });
});