const app  =require('express')();
const http = require("http").Server(app);
const io = require("socket.io")(http,{
	cors: {
    origin: '*',
  }
});
const dotenv = require('dotenv');
const session = require("express-session");
const MongoClient = require('mongodb').MongoClient;
const bcrypt = require('bcryptjs');






dotenv.config();
const port = process.env.PORT || 4001;
const uri = process.env.DATABASE_URI;
var db =null;
var MongoDBStore = require('connect-mongodb-session')(session);
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
client.connect().then((err)=>{
  db = client.db();
})



var store = new MongoDBStore({uri,collection:"sessions  ", expires: 1000 * 60 * 60});
// Catch errors
store.on('error', function(error) {
  console.log(error);
});




const sessionMiddleware = session({ secret: process.env.secret_key,store:store,resave:false,saveUninitialized:false});
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

io.use(async(socket,next) =>{
  const sessionID = socket.handshake.auth.sessionId;
  socket.auth = false;
  if (sessionID) {
    // find existing session
    store.get(sessionID,(err,data)=>{
      if(!err && data){
        socket.request.session = data;
        //socket.request.session.sessionID = sessionID;
        socket.request.session.socketIds.push(socket.id);
        socket.auth=true;
        store.set(sessionID,socket.request.session,(err)=>{
          if(err)
            console.log(err);
          next();
        })
      }
      else{
        next();
      }
    })
  }else{
    next();
  }
})

io.on('connection', (socket)=>{
  socket.on('logout',(sessionObj,callback)=>{
    if(socket.auth){
      store.get(sessionObj.sessionId,(err,sessionstore)=>{
        if(!err){
            const socketIds = sessionstore.socketIds;
            for(let i=1; i<socketIds.length; i++){
              if(socketIds[i] !== socket.id)
                io.to(socketIds[i]).emit('reload');
            }
            store.destroy(sessionObj.sessionId,(err)=>{
              if(!err){
                socket.auth = false;
                callback({status:'success'});
              }
              else{
                callback({status:'failure'});
              }
            })
          }
      });
    }
  });

  socket.on('checkauth',(callback)=>{
    if(socket.auth)
      callback({status:'success'});
    else
      callback({status:'failure'});
  })

  socket.on('getallmovies',async(callback)=>{
    if(socket.auth){
      try{
        const res = await db.collection('movies').find({}).toArray();
        if(res.length > 0)
          callback({status:'success',message:res});
        else
          callback({status:'error',message:'Nothing to update.'});
      }catch(err){
        console.log(err);
      }
    }
  })

  socket.on('getactors',async(callback)=>{
    if(socket.auth){
      try{
        const res = await db.collection('actors').find({}).toArray();
        if(res.length > 0)
          callback({status:'success',message:res});
        else
          callback({status:'error',message:'Nothing to update.'});
      }catch(err){
        console.log(err);
      }
    }
  })

  socket.on('getproducers',async(callback)=>{
    if(socket.auth){
      try{
        const res = await db.collection('producers').find({}).toArray();
        if(res.length > 0)
          callback({status:'success',message:res});
        else
          callback({status:'error',message:'Error while fetching movies.Please try again'});
      }catch(err){
        console.log(err);
      }
    }
  })

  socket.on('addcrew',async(values,id,type,callback)=>{
    if(socket.auth){
      const collection = type === 'actor'? 'actors' : 'producers';
      values.id =id;
      try{
        const res = await db.collection(collection).insertOne(values);
        callback({status:'success'});
      }catch(err){
        console.log(err);
        callback({status: 'error',message:'Error while inserting crew.Please try again'});
      }
    }
  })
  
  socket.on('addmovie',async(movie,callback)=>{
    if(socket.auth){
      try{
        const res = await db.collection('movies').insertOne(movie);
        callback({status:'success'});
      }catch(err){
        callback({status: 'error',message:'Failed to add movie.Please try again'});
      }
    }
  });

  socket.on('edit',async(movie,callback)=>{
    if(socket.auth){
      try{
        const {imdbID,Title,Runtime,Genre,Plot,imdbRating,imdbVotes,Director} = movie;
        const query = {imdbID};
        const values = {$set:{Title,Runtime,Genre,Plot,imdbRating,imdbVotes,Director}}
        const res = await db.collection('movies').updateOne(query,values);
        callback({status:'success'});
      }catch(err){
        callback({status: 'error',message:'Failed to update movie.Please try again'});
      }
    }
  });


  socket.on("signup",async (values,callback)=>{
    try{
      values.password = bcrypt.hashSync(values.password, 12);
      const res = await db.collection('users').insertOne(values);
        callback('User successfully created');
      }
    catch(e){
      console.log(e);
      callback("Account already exists");
    }
  });
  socket.on('login',async(values,callback)=>{
    try{
      var res = await db.collection('users').findOne({email:values.email},{projection:{_id:0,password:1}})
      if(res === null)
        callback({status:'error',message:'User does not exist.Please create a new account.'});
      else if(bcrypt.compareSync(values.password, res.password))
        {
          const session = socket.request.session;
          session.username = values.email;
          session.sessionID = session.id;
          session.socketIds = [0,socket.id];
          session.save((err)=>{
            if(!err){
              socket.emit('session',{sessionId:session.id,username:values.email});
              socket.auth = true;
              callback({status:'success'});
            }
          });
        }
      else{
        callback({status:'error',message:"Invalid Password."});
      }
     }catch(err){
      callback({status:'error',message:"Invalid Session.Please refresh your page to start a new session."});
     }
  })
})





  

http.listen(port, async() => {
  console.log("Listening on port :%s...", port);
});

