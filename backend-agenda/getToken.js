import { google } from 'googleapis';
import http from 'http';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
dotenv.config({ path: path.join(__dirname, '.env') });
const CALLBACK_PORT = Number(process.env.OAUTH_CALLBACK_PORT) || 3000;
const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}/oauth2callback`;
const EXPECTED_CLIENT_ID = '14838218294-0fq2cjr6tag6koq452oqhfe48egsj13h.apps.googleusercontent.com';

const SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  'https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata'
];

async function main() {
  const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf-8'));
  const oauthCredentials = credentials.web;

  if (!oauthCredentials?.client_id || !oauthCredentials?.client_secret) {
    throw new Error('credentials.json debe contener credenciales OAuth de tipo web.');
  }
  if (oauthCredentials.client_id !== EXPECTED_CLIENT_ID) {
    throw new Error(
      'credentials.json no corresponde al OAuth client indicado. Descarga el JSON correcto desde Google Cloud y reemplaza el archivo local.'
    );
  }
  if (process.env.GOOGLE_CLIENT_ID !== EXPECTED_CLIENT_ID) {
    throw new Error('Actualiza GOOGLE_CLIENT_ID en backend-agenda/.env al OAuth client indicado.');
  }
  if (!process.env.GOOGLE_CLIENT_SECRET
    || oauthCredentials.client_secret !== process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_SECRET debe coincidir con el secreto del credentials.json descargado.');
  }
  if (!oauthCredentials.redirect_uris?.includes(redirectUri)) {
    throw new Error(`Registra ${redirectUri} como URI de redirección autorizada en Google Cloud.`);
  }

  const oAuth2Client = new google.auth.OAuth2(
    oauthCredentials.client_id,
    oauthCredentials.client_secret,
    redirectUri
  );
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES
  });
  console.log('\nAbre esta URL para autorizar la cuenta de Google Photos:\n', authUrl, '\n');

  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith('/oauth2callback')) {
      res.writeHead(404).end();
      return;
    }

    const callback = new URL(req.url, redirectUri);
    const code = callback.searchParams.get('code');
    const oauthError = callback.searchParams.get('error');
    if (oauthError || !code) {
      res.writeHead(400).end('No se pudo completar la autorización. Revisa la consola.');
      server.close();
      console.error('Google Photos rechazó la autorización:', oauthError || 'falta el código.');
      return;
    }

    res.end('Autorización completada. Volvé a la consola.');
    server.close();
    try {
      const { tokens } = await oAuth2Client.getToken(code);
      if (tokens.refresh_token) {
        console.info('\nGuarda este refresh token como REFRESH_TOKEN en el .env local:');
        console.info(tokens.refresh_token);
      } else {
        console.info('Google no devolvió un refresh token; conserva el token existente.');
      }
    } catch (error) {
      console.error('No se pudo obtener el refresh token:', error.message);
    }
  }).listen(CALLBACK_PORT, '127.0.0.1', () =>
    console.log(`Servidor OAuth escuchando en http://127.0.0.1:${CALLBACK_PORT}`)
  );

  server.on('error', error => {
    console.error('No se pudo iniciar el callback OAuth:', error.message);
    process.exitCode = 1;
  });
}

main().catch(error => {
  console.error('No se pudo iniciar la autorización de Google Photos:', error.message);
  process.exitCode = 1;
});
