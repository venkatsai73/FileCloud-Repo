
const AWS = require('aws-sdk');


// Configure the AWS SDK with your credentials
AWS.config.update({
  accessKeyId: "AKIAZKUP6MHSD2EXVZ7K",
  secretAccessKey: "Z6D0X37X1GoQpqYR813E0PSMv55t7ac4uicpC8h+",
  region: "us-east-1",
});

const s3 = new AWS.S3();

  // Replace 'YOUR_S3_BUCKET_NAME' with your S3 bucket name
  const bucketName = "filecloud-s3bucket";
  const objectKey = "9b15391b-3397-4fd5-a652-47bcc05555fd.jpg"; // Assuming the filename in S3 is the same as the requested filename
// Function to generate a presigned URL for an S3 object
const expirationTimeInSeconds = 3600; // URL will expire in 1 hour (3600 seconds)

async function generatePresignedUrl(bucketName, objectKey, expirationTimeInSeconds) {
  const params = {
    Bucket: bucketName,
    Key: objectKey,
    Expires: expirationTimeInSeconds,
  };

  try {
    // Generate a presigned URL for the S3 object
    const presignedUrl = await s3.getSignedUrlPromise('getObject', params);
    return presignedUrl;
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    throw err;
  }
}



generatePresignedUrl(bucketName, objectKey, expirationTimeInSeconds)
  .then((presignedUrl) => {
    console.log('Presigned URL:', presignedUrl);
  })
  .catch((err) => {
    console.error('Error generating presigned URL:', err);
  });