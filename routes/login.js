const router = require('express').Router()
require('dotenv').config()

router.get('/' , (req , res)=>{
   if(req.session.email){
    res.redirect('/dashboard')
   }else{
    res.render('login')
   }
})

router.post('/' , (req , res)=>{
   const email = req.body.email
   const password = req.body.password
   if(email === process.env.User && password === process.env.Password){
     req.session.email = email;
     res.redirect('/dashboard')
   }else{
    req.session.destroy()
     res.redirect('/')
   }
})

router.get('/logout' , (req , res)=>{
  req.session.destroy()
  res.redirect('/');
})

module.exports  = router