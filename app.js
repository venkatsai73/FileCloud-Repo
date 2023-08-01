
//Imports
const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const session = require('express-session')
require('dotenv').config()
const port = process.env.PORT || 5000

const LoginRoute = require('./routes/login')
const DasboardRoute = require('./routes/dashboard')

//Midleware
app.set('view engine', 'ejs');
app.use('/assets', express.static('assets'))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.set('trust proxy', 1) // trust first proxy
app.use(session({  
  secret: process.env.SessionSecret,  
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // This will only work if you have https enabled!
    maxAge: 60000 // 1 min
  } 
}));


//Routes
app.use('/',LoginRoute)
app.use('/dashboard',DasboardRoute)

//Server
app.listen(port , ()=> console.log('> Server is up and running on port : ' + port))
