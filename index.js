import express from "express"
import http from "http"
import { Server } from "socket.io"
import cors from "cors"
import mysql from "mysql"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import bodyParser from "body-parser"
import cookieParser from "cookie-parser"
import session from "express-session"
import Deck from "./Deck.js"

// Create connection

const db = mysql.createConnection({
    host : 'localhost',
    user : 'root',
    password : 'w6fgh2008andrei',
    database : 'nodemysql'
});

db.connect((err) =>{
    if (err){
        console.log(err);
    }
    console.log("MySQL connected");
});

const app = express();
// parse application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// parse application/json
app.use(express.json());

app.use(cors({

    origin: ["http://localhost:8080"],
    methods: ["GET","POST"],
    credentials: true,

}));

app.use(cookieParser());

app.use(bodyParser.urlencoded({extended: true}));

app.use(session({

    name: "ceva",
    secret: "ceva ceva ceva",
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: 60 * 60 * 2400,
    }

}));


// Create DB
app.get('/createdb', (req, res) => {
    let sql = 'CREATE DATABASE nodemysql';
    db.query( sql, (err, result) => {
        if (err) console.log(err);
        console.log(result);
        res.send("database created");
    });
});

//Create Users Table
app.get('/createuserstable', (req, res) => {
    let sql = 'CREATE TABLE users(id int AUTO_INCREMENT, full_name VARCHAR(255), email VARCHAR(255), password VARCHAR(255), chips int, PRIMARY KEY (id) )';
    db.query( sql, (err,result) => {
        if (err) console.log(err);
        console.log(result);
        res.send("Users table created");
    });
});


app.post("/add_user", async (req,res) => {

    var name = req.body.name;
    var email = req.body.email;
    var password = req.body.password;

    let hashedPassword = await bcrypt.hash(password, 8);

    var sql = `INSERT INTO users (full_name,email,password,chips) VALUES ("${name}","${email}","${hashedPassword}",10000)`;
    var checkEmail = `SELECT email FROM users WHERE email = "${email}"`;
    var checkName = `SELECT full_name FROM users WHERE full_name = "${name}"`;

    db.query( checkName, (err,result) => {
        if (err) console.log(err);
        
        if ( result.length == 0 ){
            db.query( checkEmail, (err,result) => {
                if (err) console.log(err);
                
                if ( result.length == 0 ){
                    db.query( sql, (err,result) => {
                        if (err) console.log(err);
                        res.json("Account created!");
                    });
                } else {
                    res.json("Email is already used!");
                }
            });
        } else {
            res.json("Name is already used!");
        }
        
    });
    

});

const verifyJWT = ( req, res, next) => {
    const token = req.headers["x-access-token"];

    if (!token){
        res.send("we need a token");
    } else {
        jwt.verify(token, "jwtSecret", ( err, decode ) => {
            if ( err ){
                res.json({auth:false, message: "u failed to authenticate"});
            } else {
                req.userId = decoded.id;
                next();
            }

        })
    }
}

app.get("/verify_password", (req, res) => {

    if ( req.session.user ){
        res.json({loggedIn: true, user: req.session.user})
    } else {
        res.json({loggedIn: false})
    }

});

app.post("/verify_password", async (req, res) => {

    var email = req.body.email;
    var password = req.body.password;

    var query=`SELECT * FROM users WHERE email = "${email}"`;

    db.query( query, async (err,result) => {

      if( err ) console.log(err);
      
      if( result.length > 0 ){
        
        const verified = await bcrypt.compare(password, result[0].password)

        if( verified ){
        
            const id = result[0].id;
            const token = jwt.sign({id}, "jwtSecret", {
                expiresIn: 30, 
            })
            
            req.session.user = result;
            res.json({message: "Welcome!", auth: true, token: token, result: result, logat: true});

        } else {
            res.json({message: "Wrong password", logat : false});
        }
        
    
      } else {
        res.json({ message: "Email does not exist!", logat: false});
      }
    
    });

});

app.get("/logout", (req, res) => {

    req.session.destroy()
    res.json({loggedIn: false});    

});

const server = http.createServer(app);

const io = new Server(server, {
    cors:{
        origin: "http://localhost:8080",
        methods: ["GET", "POST"],
    }
});

io.on("connection", function(socket) {

    socket.on("send_message", function(data){
        socket.broadcast.emit("receive_message", data )
    })

    socket.on('join_room', function(id,room,name,chips) {                                                                   // PLAYER TRIES TO CONNECT TO A ROOM

        var sql = `SELECT * FROM games WHERE roomID=${room} AND player1ID IS NOT NULL AND player2ID IS NOT NULL`;           // VERIFY IF THE ROOM IS FULL
        db.query( sql, (err,result) => {
            if (err) console.log(err);
            if ( result.length > 0 ){
                socket.emit('room_is_full');
            }
        });

        var sql2 = `SELECT player1ID, player2ID FROM games WHERE roomID=${room}`;                                           // CHECKS IF THERE IS ANY PLAYER IN THE ROOM
        db.query( sql2, (err,result) => {
            if (err) console.log(err);
            if ( result.length == 0 ){                                                                                      // IF ROOM IS EMPTY, CREATES A ROOM AND ADDS THE FIRST PLAYER
                var sql3 = `INSERT INTO games (roomID,player1ID,numberOfPlayers,player1chips) VALUES ("${room}","${id}",1,${chips})`;
                db.query( sql3, (err,result) => {
                    if (err) console.log(err);
                });
                socket.join(room);
                socket.join(id);
                io.to(room).emit('add_data',1,name,chips,0,id);
            }

            if ( result.length > 0 ){                                                                                       // IF ROOM IS NOT EMPTY
                
                if ( result[0].player1ID != null && result[0].player2ID == null ){                                          // CHECKS IF SECOND SPOT IS OPEN AND ADDS PLAYER

                    var sql4 = `UPDATE games SET player2ID=${id},numberOfPlayers=2,player2chips=${chips} WHERE roomID=${room}`;
                    db.query( sql4, (err,result) => {
                        if (err) console.log(err);
                    });
                    
                    socket.join(room);
                    socket.join(id);

                    var sql5 = `SELECT id,full_name,chips FROM users WHERE id=${result[0].player1ID}`
                    db.query( sql5, (err,result) => {
                        if (err) console.log(err);
                        io.to(room).emit('add_data',2,name,chips,result[0].chips,result[0].id, id, result[0].full_name);
                    });
                    
                }

                if ( result[0].player1ID == null && result[0].player2ID != null ){                                          // CHECKS IF FIRST SPORT IS OPEN AND ADDS PLAYER

                    var sql6 = `UPDATE games SET player1ID=${id},numberOfPlayers=2,player1chips=${chips} WHERE roomID=${room}`;
                    db.query( sql6, (err,result) => {
                        if (err) console.log(err);
                    });
                    
                    socket.join(room);
                    socket.join(id);

                    var sql7 = `SELECT id,full_name,chips FROM users WHERE id=${result[0].player2ID}`
                    db.query( sql7, (err,result) => {
                        if (err) console.log(err);
                        io.to(room).emit('add_data',1,name,chips,result[0].chips,id,result[0].id,result[0].full_name);
                    });
                    
                }
            }
        });

    })

    socket.on("leave_room", function(id,room,pozitia) {

        var sql = `SELECT numberOfPlayers FROM games WHERE roomID=${room}`;                                                 // CHECKS HOW MANY PLAYERS ARE IN THE ROOM
        db.query( sql, (err,result) => {
            if (err) console.log(err);
            
            if ( result[0].numberOfPlayers == 2 ){                                                                          // IF THERE ARE 2 PLAYERS IN THE ROOM, HE REMOVES THE PLAYER

                var sql2 = `UPDATE games SET player1ID = ${null},player1chips=${null},numberOfPlayers=1 WHERE roomID =${room} AND player1ID=${id}`;
                db.query( sql2, (err,result) => {
                    if (err) console.log(err);
                });
                var sql3 = `UPDATE games SET player2ID = ${null},player2chips=${null},numberOfPlayers=1 WHERE roomID =${room} AND player2ID=${id}`;
                db.query( sql3, (err,result) => {
                    if (err) console.log(err);
                });

            }
            else{                                                                                                           // IF THERE IS ONLY 1 PLAYER IN THE ROOM, HE DELETES THE ROOM

                var sql = `DELETE FROM games WHERE roomID=${room}`;
                db.query( sql, (err,result) => {
                    if (err) console.log(err);
                });

                socket.leave(room);
            }

        });

    })

    socket.on("start_game", (clientRoom, id) => {

        var sql = `SELECT player1ID, player2ID FROM games WHERE roomID=${clientRoom};`;                                     // SELECTS THE IDS OF THE PLAYERS
        db.query( sql, (err,result) => {

            if (err) console.log(err);
            var player1 = result[0].player1ID;
            var player2 = result[0].player2ID;
            
            if ( player1 == id ){                                                                                           // 1ST PLAYER IS READY
                var sql2 = `UPDATE games SET player1ready=TRUE WHERE roomID=${clientRoom}`;
                db.query( sql2, (err,result) => {
                    if (err) console.log(err);
                });
            }

            if ( player2 == id ){                                                                                           // 2ND PLAYER IS READY                
                var sql3 = `UPDATE games SET player2ready=TRUE WHERE roomID=${clientRoom}`;
                db.query( sql3, (err,result) => {
                    if (err) console.log(err);
                });
            }

            var sql4 = `SELECT * FROM games WHERE roomID=${clientRoom} AND player1ready=TRUE AND player2ready=TRUE;`        // IF BOTH PLAYER ARE READY, GENERATES A DECK AND STARTS THE GAME
            db.query( sql4, (err,result) => {                                               
                if (err) console.log(err);
                if ( result.length > 0 ){

                    const deck = new Deck();
                    deck.shuffle();
                    var currentPlayer;
                    
                    if ( Math.floor(Math.random()*2) == 1 ){                                                                // RANDOMLY CHOOSES WHO ACTS FIRST
                        var sql5 = `UPDATE games SET currentPlayer=${player1}, gameStatus="preflop", player1Bet=1, player2Bet=2, player1chips=${result[0].player1chips-1}, player2chips=${result[0].player2chips-2}, pot=3 WHERE roomID=${clientRoom}`; 
                        db.query( sql5, (err,result) => {
                            if (err) console.log(err);
                        });
                        currentPlayer = player1;
                    }
                    else{
                        var sql5 = `UPDATE games SET currentPlayer=${player2}, gameStatus="preflop", player1Bet=2, player2Bet=1, player1chips=${result[0].player1chips-2}, player2chips=${result[0].player2chips-1}, pot=3 WHERE roomID=${clientRoom}`;
                        db.query( sql5, (err,result) => {
                            if (err) console.log(err);
                        });
                        currentPlayer = player2;
                    }

                    var sql6 = `INSERT INTO cards (roomID,p1checked,p2checked) VALUES ("${clientRoom}",FALSE,FALSE)`;
                    db.query( sql6, (err,result) => {
                        if (err) console.log(err);
                    });

                    var sql7 = `UPDATE cards SET p1c1v="${deck.cards[0].value}", p1c1s="${deck.cards[0].suit}", p1c2v="${deck.cards[1].value}", p1c2s="${deck.cards[1].suit}", p2c1v="${deck.cards[2].value}", p2c1s="${deck.cards[2].suit}", p2c2v="${deck.cards[3].value}", p2c2s="${deck.cards[3].suit}" WHERE roomID=${clientRoom}`;
                    db.query( sql7, (err,result) => {
                        if (err) console.log(err);
                    });

                    var sql8 = `UPDATE cards SET cc1v="${deck.cards[5].value}", cc1s="${deck.cards[5].suit}", cc2v="${deck.cards[6].value}", cc2s="${deck.cards[6].suit}", cc3v="${deck.cards[7].value}", cc3s="${deck.cards[7].suit}", cc4v="${deck.cards[9].value}", cc4s="${deck.cards[9].suit}", cc5v="${deck.cards[11].value}", cc5s="${deck.cards[11].suit}" WHERE roomID=${clientRoom}`;
                    db.query( sql8, (err,result) => {
                        if (err) console.log(err);
                    });

                    var sql9= `INSERT INTO handrank (roomID) VALUES (${clientRoom})`;
                    db.query( sql9, (err,res) => {
                        if (err) console.log(err);
                    });

                    if ( player1 == id ){                                                                                   // SENDS CARDS TO PLAYERS
                        socket.emit('startTheGame', deck.cards[0], deck.cards[1], currentPlayer);
                        io.to(player2).emit('startTheGame', deck.cards[2], deck.cards[3], currentPlayer);  
                    }

                    if ( player2 == id ){                                                                                   // SENDS CARDS TO PLAYERS
                        socket.emit('startTheGame', deck.cards[2], deck.cards[3], currentPlayer);
                        io.to(player1).emit('startTheGame', deck.cards[0], deck.cards[1], currentPlayer);
                    }
                    io.to(clientRoom).emit('set_com_cards', deck.cards[5], deck.cards[6], deck.cards[7], deck.cards[9], deck.cards[11]);

                }
            });

        });
    });

    socket.on("folded", (clientRoom, id) => {

        var sql = `SELECT * FROM games WHERE roomID=${clientRoom}`;
        db.query( sql, (err,result) => {
            if (err) console.log(err);

            var p1id = result[0].player1ID;
            var p2id = result[0].player2ID;
            var p1chips = result[0].player1chips;
            var p2chips = result[0].player2chips;
            var pot = result[0].pot;

            if ( p1id == id )
                p2chips = +p2chips + +pot;


            if ( p2id == id )
                p1chips = +p1chips + +pot;

            var sql2 = `UPDATE games SET gameStatus=null, currentPlayer=null, player1chips=${p1chips}, player2chips=${p2chips}, player1Ready=null, player2Ready=null, player1bet=null, player2bet=null, pot=null WHERE roomID=${clientRoom}; `;
            db.query( sql2, (err,result) => {
                if (err) console.log(err);
            });

            var sql3 = `UPDATE users SET chips=${p1chips} WHERE id=${p1id}; `;
            db.query( sql3, (err,result) => {
                if (err) console.log(err);
            });

            var sql4 = `UPDATE users SET chips=${p2chips} WHERE id=${p2id}; `;
            db.query( sql4, (err,result) => {
                if (err) console.log(err);
            });

            var sql5 = `DELETE FROM cards WHERE roomID=${clientRoom}`;
            db.query( sql5, (err,result) => {
                if (err) console.log(err);
            });

            var sql6 = `DELETE FROM handrank WHERE roomID=${clientRoom}`;
            db.query( sql6, (err,result) => {
                if (err) console.log(err);
            });

            io.to(clientRoom).emit('round_over', p1chips, p2chips);

        });
        
    });

    socket.on("check", (clientRoom, id) => {

        var sql = `SELECT * FROM games WHERE roomID=${clientRoom}`;
        db.query( sql, (err,result) => {
            if (err) console.log(err);

            var p1id = result[0].player1ID;
            var p2id = result[0].player2ID;
            var p1bet = result[0].player1bet;
            var p2bet = result[0].player2bet;
            var p1chips = result[0].player1chips;
            var p2chips = result[0].player2chips;
            var pot = result[0].pot;
            var status = result[0].gameStatus;
            var current = result[0].currentPlayer;

            if ( p1id == id ){
                var sql2 = `UPDATE games SET player1Bet=-1, currentPlayer=${p2id} WHERE roomID=${clientRoom}; `;
                p1bet = "CHECK";
                current = p2id;
            }

            if ( p2id == id ){
                var sql2 = `UPDATE games SET player2Bet=-1, currentPlayer=${p1id} WHERE roomID=${clientRoom}; `;
                p2bet = "CHECK";
                current = p1id;
            }

            db.query( sql2, (err,result) => {
                if (err) console.log(err);
            });

            if ( (p1bet == "CHECK" && p2bet == -1) || (p1bet == -1 && p2bet == "CHECK") ){

                p1bet = 0;
                p2bet = 0;

                if ( status == "river" ){
                    var sql3 = `UPDATE games SET gameStatus="showdown", player1Bet=0, player2Bet=0 WHERE roomID=${clientRoom};`;
                    status = "showdown";
                }
    
                if ( status == "turn" ){
                    var sql3 = `UPDATE games SET gameStatus="river", player1Bet=0, player2Bet=0 WHERE roomID=${clientRoom};`;
                    status = "river";
                }
    
                if ( status == "flop" ){
                    var sql3 = `UPDATE games SET gameStatus="turn", player1Bet=0, player2Bet=0 WHERE roomID=${clientRoom};`;
                    status = "turn";
                }
    
                if ( status == "preflop" ){
                    var sql3 = `UPDATE games SET gameStatus="flop", player1Bet=0, player2Bet=0 WHERE roomID=${clientRoom};`;
                    status = "flop";
                }

                db.query( sql3, (err,result) => {
                    if (err) console.log(err);
                });

                if ( status != "showdown" ){
                    io.to(clientRoom).emit('next_turn', current, p1chips, p1bet, p2chips, p2bet, pot, status);
                }
                else{
                    var sql4 = `SELECT * FROM cards;`;
                    db.query( sql4, (err,result) => {
                        if (err) console.log(err);
                        
                        var p1c1v = result[0].p1c1v;
                        var p1c1s = result[0].p1c1s;
                        var p1c2v = result[0].p1c2v;
                        var p1c2s = result[0].p1c2s;
    
                        var p2c1v = result[0].p2c1v;
                        var p2c1s = result[0].p2c1s;
                        var p2c2v = result[0].p2c2v;
                        var p2c2s = result[0].p2c2s;
    
                        io.to(p1id).emit('opp_cards', p2c1v, p2c1s, p2c2v, p2c2s);
                        io.to(p2id).emit('opp_cards', p1c1v, p1c1s, p1c2v, p1c2s);
                    });
                }

            }
            else{
                io.to(clientRoom).emit('next_turn', current, p1chips, p1bet, p2chips, p2bet, pot, status);
            }

        });

    });

    socket.on("call", (clientRoom, id) => {

        var sql = `SELECT * FROM games WHERE roomID=${clientRoom}`;
        db.query( sql, (err,result) => {
            if (err) console.log(err);

            var p1id = result[0].player1ID;
            var p2id = result[0].player2ID;
            var p1bet = result[0].player1bet;
            var p2bet = result[0].player2bet;
            var p1chips = result[0].player1chips;
            var p2chips = result[0].player2chips;
            var pot = result[0].pot;
            var status = result[0].gameStatus;
            var current = result[0].currentPlayer;

            if ( p1bet == -1 )
                p1bet = 0;
        
            if ( p2bet == -1 )
                p2bet = 0;

            if ( p1id == id ){
                p1chips = +p1chips + +p1bet - +p2bet;
                pot = +pot - +p1bet + +p2bet;
                var sql2 = `UPDATE games SET player1bet=0, player2bet=0, currentPlayer=${p2id}, player1chips=${p1chips}, pot=${pot} WHERE roomID=${clientRoom}; `;
                current = p2id;
            }

            if ( p2id == id ){
                p2chips = +p2chips + +p2bet - +p1bet;
                pot = +pot - +p2bet + +p1bet;
                var sql2 = `UPDATE games SET player1bet=0, player2bet=0, currentPlayer=${p1id}, player2chips=${p2chips}, pot=${pot} WHERE roomID=${clientRoom}; `;
                current = p1id;
            }

            p1bet = 0;
            p2bet = 0;

            db.query( sql2, (err,result) => {
            if (err) console.log(err);
            });

            if ( status == "river" ){
                var sql3 = `UPDATE games SET gameStatus="showdown" WHERE roomID=${clientRoom};`;
                status = "showdown";
            }

            if ( status == "turn" ){
                var sql3 = `UPDATE games SET gameStatus="river" WHERE roomID=${clientRoom};`;
                status = "river";
            }

            if ( status == "flop" ){
                var sql3 = `UPDATE games SET gameStatus="turn" WHERE roomID=${clientRoom};`;
                status = "turn";
            }

            if ( status == "preflop" ){
                var sql3 = `UPDATE games SET gameStatus="flop" WHERE roomID=${clientRoom};`;
                status = "flop";
            }
            
            db.query( sql3, (err,result) => {
                if (err) console.log(err);
            });

            if ( status != "showdown" )
                io.to(clientRoom).emit('next_turn', current, p1chips, p1bet, p2chips, p2bet, pot, status);
            else{
                var sql4 = `SELECT * FROM cards;`;
                db.query( sql4, (err,result) => {
                    if (err) console.log(err);
                    
                    var p1c1v = result[0].p1c1v;
                    var p1c1s = result[0].p1c1s;
                    var p1c2v = result[0].p1c2v;
                    var p1c2s = result[0].p1c2s;

                    var p2c1v = result[0].p2c1v;
                    var p2c1s = result[0].p2c1s;
                    var p2c2v = result[0].p2c2v;
                    var p2c2s = result[0].p2c2s;

                    io.to(p1id).emit('opp_cards', p2c1v, p2c1s, p2c2v, p2c2s);
                    io.to(p2id).emit('opp_cards', p1c1v, p1c1s, p1c2v, p1c2s);
                });
                
            }


        });
            
    });

    socket.on("bet", (clientRoom, id, BetAmount) => {

        var sql = `SELECT * FROM games WHERE roomID=${clientRoom}`;
        db.query( sql, (err,result) => {
            if (err) console.log(err);

            var p1id = result[0].player1ID;
            var p2id = result[0].player2ID;
            var p1bet = result[0].player1bet;
            var p2bet = result[0].player2bet;
            var p1chips = result[0].player1chips;
            var p2chips = result[0].player2chips;
            var pot = result[0].pot;
            var status = result[0].gameStatus;
            var current = result[0].currentPlayer;

            if ( p1bet == -1 )
                p1bet = 0;
            
            if ( p2bet == -1 )
                p2bet = 0;

            if ( p1id == id ){
                p1chips = p1chips + p1bet - BetAmount;
                pot = +pot + +BetAmount - +p1bet;
                p1bet = BetAmount;
                var sql2 = `UPDATE games SET player1Bet=${BetAmount}, currentPlayer=${p2id}, player1chips=${p1chips}, pot=${pot} WHERE roomID=${clientRoom}; `;
                current = p2id;
            }
            if ( p2id == id ){
                p2chips = p2chips+p2bet-BetAmount;
                pot = +pot + +BetAmount - +p2bet;
                p2bet = BetAmount;
                var sql2 = `UPDATE games SET player2Bet=${BetAmount}, currentPlayer=${p1id}, player2chips=${p2chips}, pot=${pot} WHERE roomID=${clientRoom}; `;
                current = p1id;
            }

            db.query( sql2, (err,result) => {
                if (err) console.log(err);
            });

            io.to(clientRoom).emit('next_turn', current, p1chips, p1bet, p2chips, p2bet, pot, status);

        });
        
    });

    socket.on("choose_winner", (clientRoom,id) => {

    
        var sql = `SELECT * FROM cards WHERE roomID=${clientRoom}`;
        db.query( sql, (err,result) => {
            if (err) console.log(err);
            if ( result.length > 0 ){
                var sql2 = `SELECT player1ID, player2ID FROM games WHERE roomID=${clientRoom}`;
                db.query( sql2, (err,res) => {
                    if (err) console.log(err);
                    
                    if ( res[0].player1ID == id )
                        var cards = [result[0].p1c1v, result[0].p1c1s, result[0].p1c2v, result[0].p1c2s, result[0].cc1v, result[0].cc1s, result[0].cc2v, result[0].cc2s, result[0].cc3v, result[0].cc3s, result[0].cc4v, result[0].cc4s, result[0].cc5v, result[0].cc5s];
                    if ( res[0].player2ID == id )
                        var cards = [result[0].p2c1v, result[0].p2c1s, result[0].p2c2v, result[0].p2c2s, result[0].cc1v, result[0].cc1s, result[0].cc2v, result[0].cc2s, result[0].cc3v, result[0].cc3s, result[0].cc4v, result[0].cc4s, result[0].cc5v, result[0].cc5s];

                    var suits = [0,0,0,0];
                    var value = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
                    var finalhand = [0,0,0,0,0];
                    var finalcolor = "";
                    var flush = false;
                    var straight = false;
                    var most_dup = 1;
                    var most_dup_2 = 1;
                    var howMany = 0;
    
                    for ( let i=0 ; i<=13 ; i++ ){
                        if ( cards[i] == "A" ){
                            value[1]++;
                            value[14]++;
                        }
                        if ( cards[i] == 2 )
                            value[2]++;
                        if ( cards[i] == 3 )
                            value[3]++;
                        if ( cards[i] == 4 )
                            value[4]++;
                        if ( cards[i] == 5 )
                            value[5]++;
                        if ( cards[i] == 6 )
                            value[6]++;
                        if ( cards[i] == 7 )
                            value[7]++;
                        if ( cards[i] == 8 )
                            value[8]++;
                        if ( cards[i] == 9 )
                            value[9]++;
                        if ( cards[i] == 10 )
                            value[10]++;
                        if ( cards[i] == "J" )
                            value[11]++;
                        if ( cards[i] == "Q" )
                            value[12]++;
                        if ( cards[i] == "K" )
                            value[13]++;
            
                        if ( cards[i] == "♠" ){
                            suits[0]++;
                            if ( suits[0] >= 5 ){
                                finalcolor = "♠";
                                flush = true;
                            }
                        }
                        if ( cards[i] == "♣" ){
                            suits[1]++;
                            if ( suits[1] >= 5 ){
                                finalcolor = "♣";
                                flush = true;
                            }
                        }
                        if ( cards[i] == "♥" ){
                            suits[2]++;
                            if ( suits[2] >= 5 ){
                                finalcolor = "♥";
                                flush = true;
                            }
                        }
                        if ( cards[i] == "♦" ){
                            suits[3]++;
                            if ( suits[3] >= 5 ){
                                finalcolor = "♦";
                                flush = true;
                            }
                        }
                    }

                    if ( flush == true ){
                        var maxfivecards = 5;
                        for ( let i=14 ; i>=2 ; i-- ){
                            if ( cards[i] == finalcolor && maxfivecards > 0 ){
                                finalhand[5-maxfivecards] = i;
                                maxfivecards--;
                            }
                        }
                    }
                    else{
                        for ( let i=1 ; i<=10 ; i++ ){
                            if ( value[i] >= 1 && value[i+1] >= 1 && value[i+2] >= 1 && value[i+3] >= 1 && value[i+4] >= 1 ){
                                straight = true;
                                finalhand=[i+4,i+3,i+2,i+1,i];
                            }
                        }
                        if ( straight == false ){
                            for ( let i=14 ; i>=2 ; i-- ){
                                if ( value[i] > most_dup ){
                                    most_dup_2 = most_dup;
                                    most_dup = value[i];
                                    for ( let j=0 ; j<most_dup ; j++ ){
                                        finalhand[j]=i;
                                    }
                                    if ( most_dup_2 != 1){
                                        for ( let j=0 ; j<most_dup_2 ; j++ ){
                                            finalhand[j+most_dup]=i;
                                        }
                                    }
                                }
                                else{
                                    if ( value[i] > most_dup_2 && value[i]!=1 ){
                                        most_dup_2 = value[i];
                                        for ( let j=0 ; j<most_dup_2 ; j++ ){
                                            finalhand[j+most_dup]=i;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    if ( most_dup == 1 && most_dup_2 == 1 )
                        howMany = 0;
                    if ( most_dup != 1 && most_dup_2 == 1)
                        howMany = most_dup;
                    if ( most_dup != 1 && most_dup_2 != 1)
                        howMany = most_dup+most_dup_2;

                    if ( straight==false && flush==false ){
                        for ( let i=14 ; i>=2 ; i-- ){
                            if ( value[i] == 1 && howMany < 5 ){
                                finalhand[howMany]=i;
                                howMany++;
                            }
                        }
                    }

                    var hr = 0;
    
                    if ( flush ){
                        if ( straight ){
                            hr = 10;
                            socket.emit('showdown', "Royal Flush!", id);
                        }
                        else{
                            hr = 6;
                            socket.emit('showdown', "Flush!", id);
                        }
                    }
                    else{
                        if ( straight ){
                            hr = 5;
                            socket.emit('showdown', "Straight!", id);
                        }
                        else{
                            if ( most_dup == 4 ){
                                hr = 8;
                                socket.emit('showdown', "Quads!", id);
                            }
                            else{
                                if ( most_dup == 3 ){
                                    if ( most_dup_2 >= 2 ){
                                        hr = 7;
                                        socket.emit('showdown', "Full House!", id);
                                    }
                                    else{
                                        hr = 4;
                                        socket.emit('showdown', "Trips!", id);
                                    }
                                }
                                else{
                                    if ( most_dup == 2){
                                        if ( most_dup_2 == 2){
                                            hr = 3;
                                            socket.emit('showdown', "Two Pairs!", id);
                                        }
                                        else{
                                            hr = 2;
                                            socket.emit('showdown', "One Pair!", id);
                                        }
                                    }
                                    else{
                                        hr = 1;
                                        socket.emit('showdown', "High Card!", id);
                                    }
                                }
                            }
                        }
                    }

                    if ( res[0].player1ID == id )
                        var sql3 = `UPDATE handrank SET p1hr=${hr}, p1v1=${finalhand[0]}, p1v2=${finalhand[1]}, p1v3=${finalhand[2]}, p1v4=${finalhand[3]}, p1v5=${finalhand[4]} WHERE roomID=${clientRoom};`;
                    if ( res[0].player2ID == id )
                        var sql3 = `UPDATE handrank SET p2hr=${hr}, p2v1=${finalhand[0]}, p2v2=${finalhand[1]}, p2v3=${finalhand[2]}, p2v4=${finalhand[3]}, p2v5=${finalhand[4]} WHERE roomID=${clientRoom};`;

                    db.query( sql3, (err,result) => {
                        if (err) console.log(err);
                    });

                });
            }

        });
        
    });

    socket.on("give_chips", (clientRoom, id) => {

        var sql2= `SELECT * FROM games WHERE roomID=${clientRoom};`;
        db.query( sql2, (err,result) => {
            if (err) console.log(err);

            var p1id = result[0].player1ID;
            var p2id = result[0].player2ID;
            var p1chips = result[0].player1chips;
            var p2chips = result[0].player2chips;
            var pot = result[0].pot;
            
            var sql4 = `SELECT * FROM handrank WHERE roomID=${clientRoom}`;
            db.query( sql4, (err,resulta) => {
                if (err) console.log(err);

                if ( resulta.length > 0 ){

                    if ( resulta[0].p1hr!=0 && resulta[0].p2hr!=0 ){
                    
                        var p1hr = resulta[0].p1hr;
                        var p2hr = resulta[0].p2hr;
                        var p1hand = [resulta[0].p1v1,resulta[0].p1v2,resulta[0].p1v3,resulta[0].p1v4,resulta[0].p1v5];
                        var p2hand = [resulta[0].p2v1,resulta[0].p2v2,resulta[0].p2v3,resulta[0].p2v4,resulta[0].p2v5];

                        if ( p1hr > p2hr || ( p1hr == p2hr && p1hand[0] > p2hand[0] ) || ( p1hr == p2hr && p1hand[0] == p2hand[0] && p1hand[1] > p2hand[1] ) || ( p1hr == p2hr && p1hand[0] == p2hand[0] && p1hand[1] == p2hand[1] && p1hand[2] > p2hand[2] ) || ( p1hr == p2hr && p1hand[0] == p2hand[0] && p1hand[1] == p2hand[1] && p1hand[2] == p2hand[2] && p1hand[3] > p2hand[3]) || ( p1hr == p2hr && p1hand[0] == p2hand[0] && p1hand[1] == p2hand[1] && p1hand[2] == p2hand[2] && p1hand[3] == p2hand[3] && p1hand[4] > p2hand[4])){
                            p1chips = +p1chips + +pot;
                            console.log("P1 CASTIGA",p1hr, p2hr, p1hand, p2hand);
                            io.to(clientRoom).emit('round_over', p1chips, p2chips);
                        }

                        if ( p2hr > p1hr || ( p2hr == p1hr && p2hand[0] > p1hand[0] ) || ( p2hr == p1hr && p2hand[0] == p1hand[0] && p2hand[1] > p1hand[1] ) || ( p2hr == p1hr && p2hand[0] == p1hand[0] && p2hand[1] == p1hand[1] && p2hand[2] > p1hand[2] ) || ( p2hr == p1hr && p2hand[0] == p1hand[0] && p2hand[1] == p1hand[1] && p2hand[2] == p1hand[2] && p2hand[3] > p1hand[3]) || ( p2hr == p1hr && p2hand[0] == p1hand[0] && p2hand[1] == p1hand[1] && p2hand[2] == p1hand[2] && p2hand[3] == p1hand[3] && p2hand[4] > p1hand[4])){
                            p2chips = +p2chips + +pot;
                            console.log("P2 CASTIGA",p1hr, p2hr, p1hand, p2hand);
                            io.to(clientRoom).emit('round_over', p1chips, p2chips);
                        }
                        if ( p1hr == p2hr && p1hand[0] == p2hand[0] && p1hand[1] == p2hand[1] && p1hand[2] == p2hand[2] && p1hand[3] == p2hand[3] && p1hand[4] == p2hand[4] ){
                            p1chips = +p1chips + +pot/2;
                            p2chips = +p2chips + +pot/2;
                            console.log("EGAL", p1hr, p2hr, p1hand, p2hand);
                            io.to(clientRoom).emit('round_over', p1chips, p2chips);
                        }

                        var sql5 = `UPDATE games SET gameStatus=null, currentPlayer=null, player1chips=${p1chips}, player2chips=${p2chips}, player1Ready=null, player2Ready=null, player1bet=null, player2bet=null, pot=null WHERE roomID=${clientRoom}; `;
                        db.query( sql5, (err,result) => {
                            if (err) console.log(err);
                        });

                        var sql6 = `UPDATE users SET chips=${p1chips} WHERE id=${p1id}; `;
                        db.query( sql6, (err,result) => {
                            if (err) console.log(err);
                        });

                        var sql7 = `UPDATE users SET chips=${p2chips} WHERE id=${p2id}; `;
                        db.query( sql7, (err,result) => {
                            if (err) console.log(err);
                        });

                        var sql8 = `DELETE FROM cards WHERE roomID=${clientRoom}`;
                        db.query( sql8, (err,result) => {
                            if (err) console.log(err);
                        });

                        var sql9 = `DELETE FROM handrank WHERE roomID=${clientRoom}`;
                        db.query( sql9, (err,result) => {
                            if (err) console.log(err);
                        });
                    }
                }
            });
    
        });
        
    });

});

app.get("/", (req, res) => {
    
    res.send("Session");

});

server.listen(8081, () =>{
    console.log("SERVER IS ONLINE");
});

