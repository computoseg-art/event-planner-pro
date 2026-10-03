// server/getToken.js
import { google } from 'googleapis';
import http from 'http';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

const SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  'https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata'
];

async function main() {
  const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf-8'));
  const { client_secret, client_id, redirect_uris } = credentials.web;

  const redirectUri = 'http://127.0.0.1:3000/oauth2callback';
  if (!redirect_uris.includes(redirectUri)) {
    throw new Error(`El redirectUri ${redirectUri} NO está en credentials.web.redirect_uris`);
  }

  console.log('Using client_id:', client_id);
  console.log('Using redirectUri:', redirectUri);

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES
  });
  console.log('\nAuthorize this app by visiting this url:\n', authUrl, '\n');

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/oauth2callback')) {
        const code = new URL(req.url, 'http://127.0.0.1:3000').searchParams.get('code');
        res.end('¡Listo! Volvé a la consola.');
        server.close();
        const { tokens } = await oAuth2Client.getToken(code);
        console.info('-----------------');
        console.info('REFRESH_TOKEN:', tokens.refresh_token);
        console.info('-----------------');
        process.exit(0);
      } else {
        res.writeHead(404).end();
      }
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  }).listen(3000, '127.0.0.1', () =>
    console.log('Server listening on http://127.0.0.1:3000')
  );
}
main().catch(console.error);
