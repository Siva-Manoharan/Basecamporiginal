// auth.js

const axios = require('axios');

const authenticate = async () => {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    response_type: 'code',
    scope: 'FULL_ACCESS_SCOPES=basecamp:all basecamp:write', 
  });

  const authUrl = `https://launchpad.37signals.com/authorization/new?${params.toString()}`;
  return authUrl;
};

const handleCallback = async (code) => {
  try {
    const tokenResponse = await axios.post('https://launchpad.37signals.com/authorization/token', {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code,
      redirect_uri: process.env.REDIRECT_URI,
      type: 'web_server',
    });
    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;
    console.log("Access token: " + accessToken);
    console.log("Refresh token: " + refreshToken);
    return 'Authorization successful!';
  } catch (error) {
    console.error('Error during authorization:', error.message);
    throw new Error('Internal Server Error');
  }
};

const refreshAccessToken = async (refreshToken) => {
  try {
    const refreshResponse = await axios.post('https://launchpad.37signals.com/authorization/token', {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      refresh_token: refreshToken,
      type: 'refresh',
    });

    const newAccessToken = refreshResponse.data.access_token;
    const newRefreshToken = refreshResponse.data.refresh_token;
    console.log("New Access token: " + newAccessToken);
    console.log("New Refresh token: " + newRefreshToken);
    // Update the stored access token and refresh token securely for future use
    return { access_token: newAccessToken, refresh_token: newRefreshToken };
  } catch (error) {
    console.error('Error during token refresh:', error.message);
    throw new Error('Internal Server Error');
  }
};


module.exports = {
  authenticate,
  handleCallback,
  refreshAccessToken
};
