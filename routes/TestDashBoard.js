const router = require('express').Router()
const multer = require('multer');
const path = require('path');
const { s3 ,db ,ses } = require('../AWSConfig');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { v4: uuidv4 } = require('uuid');
require('dotenv').config()

//SessionCheckerMiddlewareDeclartion
const sessionChecker = (req, res, next) => {    
    if (req.session.email) {
        next();
    } else {
    res.redirect('/');
    }
};

//GenerateUniqureFileName To Avoid FileNameCollision
function generateUniqueFileName(originalName) {
    const fileExtension = path.extname(originalName);
    const uniqueFileName = `${uuidv4()}${fileExtension}`;
    return uniqueFileName;
  }


router.get('/', sessionChecker , (req , res)=>{
    res.render('dashboard')
})


router.post('/upload', sessionChecker, upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    const uniqueFileName = generateUniqueFileName(req.file.originalname);
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: uniqueFileName,
      Body: req.file.buffer,
    };
  
    s3.upload(params, (err, data) => {
      if (err) {
        console.error('Error:', err);
        return res.status(500).send('Error uploading file.');
      }

      const fileMetadata = {
        id: uuidv4(), // Generate a unique ID for the file
        originalName: req.file.originalname,
        uniqueFileName: uniqueFileName,
        s3Url: data.Location,
        fileSize :req.file.size
      };
  

      const fileUrl = data.Location;
      const token = uuidv4(); 

      const bccEmails = Object.keys(req.body)
      .filter((key) => key.startsWith('email'))
      .map((key) => {
        const email = req.body[key].trim();
        if (email && email.length > 0) {
          return {
            email: email,
            token: token, 
            downloaded: false,
          };
        }
        
        return null; 
      })
      .filter(Boolean);

      console.log(bccEmails)

      const dbParams = {
        TableName: process.env.AWS_DYNAMODB_TABLE,
        Item: fileMetadata,
      };

      db.put(dbParams, (dbErr) => {
        if (dbErr) {
          console.error('Error saving file metadata to DynamoDB:', dbErr);
          return res.status(500).send('Error saving file metadata.');
        }
  

        const sesParams = {
            Destination: {
              BccAddresses: bccEmails.map((item) => item.email),
            },
            Message: {
              Body: {
                Html: {
                  Data: `
                    <p>Here is the link to download the file: <a href="${fileUrl}?token=${token}">${fileUrl}</a></p>
                    <p>Please note that the link will be valid for one-time download.</p>
                  `,
                },
              },
              Subject: {
                Data: `Download File  - ${fileMetadata.uniqueFileName} `,
              },
            },
            Source: process.env.AWS_SES_MAILID, // Replace with your verified SES email address
          };
      


          ses.sendEmail(sesParams, (sesErr, sesData) => {
            if (sesErr) {
              console.error('Error sending email:', sesErr);
              return res.status(500).send('Error sending email.');
            }
      
            console.log('Email sent successfully:', sesData);
            return res.send('File uploaded, Created UsageRecord and email sent to the recipients using BCC.');
          });


      });
    });
  });


module.exports  = router