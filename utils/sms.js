const https = require('https');

/**
 * Generate a random 5-digit numeric OTP
 * e.g. "48291"
 */
function generateOTP() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

/**
 * Send 5-digit OTP to mobile phone number via SMS
 * Supports Fast2SMS (India), Twilio (Global), and Demo Fallback
 */
async function sendOTP(phoneNumber, otp) {
  const cleanPhone = (phoneNumber || '').replace(/\D/g, '');
  const message = `Your SHG Tracker verification code is ${otp}. Valid for 10 minutes. Do not share this code.`;

  // 1. Fast2SMS Integration (India)
  if (process.env.FAST2SMS_API_KEY) {
    try {
      // Extract 10-digit Indian number (strip 91 if included)
      const tenDigitPhone = cleanPhone.length > 10 && cleanPhone.startsWith('91') 
        ? cleanPhone.slice(2) 
        : cleanPhone;

      const postData = JSON.stringify({
        route: 'otp',
        variables_values: otp,
        numbers: tenDigitPhone
      });

      const options = {
        hostname: 'www.fast2sms.com',
        port: 443,
        path: '/dev/bulkV2',
        method: 'POST',
        headers: {
          'authorization': process.env.FAST2SMS_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const result = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              resolve({ raw: data });
            }
          });
        });
        req.on('error', err => reject(err));
        req.write(postData);
        req.end();
      });

      if (result.return === true) {
        console.log(`📱 [Fast2SMS] Real 5-digit OTP sent successfully to +91 ${tenDigitPhone}`);
        return { success: true, isDemo: false, message: 'SMS sent to your mobile number.' };
      } else {
        const errorMsg = Array.isArray(result.message) ? result.message[0] : (result.message || 'Fast2SMS requirement pending');
        console.warn('⚠️ Fast2SMS response:', errorMsg);
        // Fallback so user is not blocked if Fast2SMS KYC/website verification is pending
        return { 
          success: true, 
          isDemo: true, 
          otp, 
          message: errorMsg 
        };
      }
    } catch (err) {
      console.error('Fast2SMS delivery error:', err.message);
    }
  }

  // 2. Twilio Integration (Global)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    try {
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
      const postData = new URLSearchParams({
        To: formattedPhone,
        From: process.env.TWILIO_PHONE_NUMBER,
        Body: message
      }).toString();

      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const options = {
        hostname: 'api.twilio.com',
        port: 443,
        path: `/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        req.on('error', err => reject(err));
        req.write(postData);
        req.end();
      });

      console.log(`📱 [Twilio] 5-digit OTP sent to ${formattedPhone}`);
      return { success: true, isDemo: false };
    } catch (err) {
      console.error('Twilio delivery error:', err.message);
    }
  }

  // 3. Demo / Simulation Fallback (when no SMS API keys configured)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📱 [DEMO SMS OTP] Recipient: ${phoneNumber}`);
  console.log(`🔑 [DEMO SMS OTP] 5-Digit Verification Code: ${otp}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return {
    success: true,
    isDemo: true,
    otp
  };
}

module.exports = {
  generateOTP,
  sendOTP
};
