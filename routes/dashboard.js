const router = require('express').Router()
const multer = require('multer');
const path = require('path');
const { s3 ,db ,lambda} = require('../AWSConfig');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { v4: uuidv4 } = require('uuid');
require('dotenv').config()
const BASEAPPURL = process.env.WEB_APP_URL

//SessionCheckerMiddlewareDeclartion
const sessionChecker = (req, res, next) => {    
    if (req.session.email) {
        next();
    } else {
    res.redirect('/');
    }
};

//GenerateUniqureFileName To Avoid FileNameCollision
const  generateUniqueFileName = (originalName) => {
    const fileExtension = path.extname(originalName);
    const uniqueFileName = `${uuidv4()}${fileExtension}`;
    return uniqueFileName;
}


//S3FileUploadHandlder
const UploadToS3 =(params)=>{
  return new Promise((reslove,reject)=>{
    s3.upload(params,(err,data)=>{
        if(err) reject(err)
        else reslove(data)
    })
  })
}


//SaveToDynamoDBHandler
const SaveToDynamoDB=(params)=>{
  return new Promise((resolve,reject)=>{
    db.put(params,(err,data)=>{
      if(err) reject(err)
      else resolve(data.Attributes)
    })
  })
}


//TriggerLambdaFunction
const TriggerLambdaSES = (functionName, payload)=> {
  const params = {
    FunctionName: functionName,
    Payload: JSON.stringify(payload),
  };

  return new Promise((resolve, reject) => {
    lambda.invoke(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}


//GenerateDownloadLinkHandler 
const GenerateDownloadLink =async (objectKey)=> {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: objectKey,
    Expires: 3600,
  };

  try {
    const presignedUrl = await s3.getSignedUrlPromise('getObject', params);
    return presignedUrl;
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    throw err;
  }
}


//FetchRecords
const GenerateUsageRecord= async()=>{
  const params = {
    TableName: process.env.AWS_DYNAMODB_TABLE,
  };
  try {
    const data = await db.scan(params).promise();
    return data.Items;
  } catch (err) {
    console.error('Error getting data from DynamoDB:', err);
    throw err;
  }
}

// //FetechRecordFromDyanmoDBHandler
// const FetchFromDynamoDB=(params)=>{
//   return new Promise((resolve, reject) => {
//     db.get(params, (err, data) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(data.Item);
//       }
//     });
//   });
// }



//###############################################
//Routes
//###############################################

router.get('/', sessionChecker , (req , res)=>{
    res.render('dashboard')
})


router.get('/upload',sessionChecker,(req,res)=>{
  res.redirect('/dashboard')
})


router.post('/upload', sessionChecker, upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

  //returns Array [{email:"email"}]
  const ToEmails = Object.keys(req.body)
    .filter((key) => key.startsWith('email'))
    .map((key) => {
    const email = req.body[key].trim();
    if (email && email.length > 0) {
        return {
        email: email,
        token : uuidv4(), 
        downloaded: false,
        };
    } 
    return null; 
    })
   .filter(Boolean);


    const uniqueFileName = generateUniqueFileName(req.file.originalname);
    const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: uniqueFileName,
            Body: req.file.buffer,
    };
  
    UploadToS3(params)
    .then((data)=>{

          //Creating A Record in DynamoDB of the File Uploaded
          const fileMetadata = {
            id: uuidv4(), // Generate a unique ID for the file
            originalName: req.file.originalname,
            uniqueFileName: uniqueFileName,
            s3Url: data.Location,
            fileSize :req.file.size,
            toemails:{
              data: ToEmails
            }
          };

          const dbParams = {
            TableName: process.env.AWS_DYNAMODB_TABLE,
            Item: fileMetadata,
          };

          SaveToDynamoDB(dbParams)
          .then((data)=>{

          //Send Email 
            const LambdaFN = process.env.AWS_LAMBDA_FN;
            
            const SendMail =async (item)=>{
              let payload = {
                Recipients:item.email,
                UniqueFileName:uniqueFileName,
                OriginalName:req.file.originalname,
                DownloadUrl:`${BASEAPPURL}/dashboard/download/${uniqueFileName}/`
              };
              //DownloadUrl:`${BASEAPPURL}/dashboard/download/${fileMetadata.id}/${item.token}/${uniqueFileName}`
              return new Promise((resolve)=>{
                TriggerLambdaSES(LambdaFN, payload)
                    .then((data) => {
                      console.log('Lambda function invoked successfully:', data);
                      resolve('Sent')
                    })
                    .catch((err) => {
                      console.error('Error invoking Lambda function:', err);
                      resolve('FailedToSent')
                    });
               })
            }

            const SendMailPromiseChain = ToEmails.map((item) => SendMail(item));

            Promise.all(SendMailPromiseChain)
            .then(()=>{
              res.render('status',{
                  data:{
                    status:200,
                    message:  "File Uploaded And Links Sent To The Emails"
                  }
              })
            })
            
          }).catch((err)=>{
            console.log(`Failed To Save FileRecord In DyanamoDb - ${err}`)
            res.render('status',{data:{
                  status:500,
                  message: `Failed To Save FileRecord In DyanamoDb - ${err}`
                }
            })
          })
        
        
        })
        .catch((err)=>{
            console.log(`Failed To Save FileRecord In S3 - ${err}`)
            res.render('status',{
              data:{
                status:500,
                message: `Failed To Save FileRecord In S3 - ${err}`
              }
            })
         })
  
      });


router.get('/usage', sessionChecker, async (req,res)=>{
  GenerateUsageRecord()
  .then((items) => {
    //console.log('All data from DynamoDB table:', items);
    res.render('usage',{items})
  })
  .catch((err) => {
    items={}
    console.error('Error:', err);
    res.render('usage',{items})
  });
    
})


router.get('/download/:filename', async (req, res) => {
          let filename = req.params['filename'];
          GenerateDownloadLink(filename)
          .then((presignedUrl) => {
          console.log('Presigned URL:', presignedUrl);
          res.redirect(presignedUrl)
          })
          .catch((err) => {
           res.render('status',{
            data:{
            status:500,
            message: `No File Available To Download - ${err}`
            }
          })
          });
})



module.exports  = router