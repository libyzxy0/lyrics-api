const express = require('express');
const axios = require('axios');
//const fs = require('fs').promises;
const app = express();
const port = 3000;
let conf;

function convertTextToDurationObject(text) {
  const parts = text.split(/\s(?=\[\d{2}:\d{2}\.\d{2}\])/);
  const result = {};

  parts.forEach(part => {
    const [duration, content] = part.split('] ');
    result[duration.slice(1)] = content;
  });

  return result;
}

class Musix {
    constructor() {
        this.tokenUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0';
        this.searchTermUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/track.search?app_id=web-desktop-app-v1.0&page_size=5&page=1&s_track_rating=desc&quorum_factor=1.0';
        this.lyricsUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0&subtitle_format=lrc';
        this.lyricsAlternative = 'https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&namespace=lyrics_richsynched&subtitle_format=mxm&app_id=web-desktop-app-v1.0';
    }

    async get(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'authority': 'apic-desktop.musixmatch.com',
                    'cookie': 'AWSELBCORS=0; AWSELB=0;'
                }
            });
            return response.data;
        } catch (error) {
            throw new Error('Failed to fetch data from the API');
        }
    }

    async getToken() {
        try {
            const result = await this.get(this.tokenUrl);
            const token = result.message.body.user_token;
            await this.saveToken(token);
            return token;
        } catch (error) {
            throw new Error('Failed to retrieve access token');
        }
    }

    async saveToken(token) {
        const expiration_time = Date.now() + 600000; // 10 minutes
        const token_data = { user_token: token, expiration_time };
        conf = JSON.stringify(token_data);
        //await fs.writeFile('musix.txt', JSON.stringify(token_data));
    }

    async checkTokenExpire() {
        try {
            const tokenData = await this.loadToken();
            const { expiration_time } = tokenData;
            if (expiration_time < Date.now()) {
                await this.getToken();
            }
        } catch (error) {
            await this.getToken();
        }
    }

    async loadToken() {
        //const tokenData = await fs.readFile('musix.txt', 'utf-8');
        return JSON.parse(conf);
    }

    async getLyrics(trackId) {
        try {
            await this.checkTokenExpire();
            const tokenData = await this.loadToken();
            const formattedUrl = `${this.lyricsUrl}&track_id=${trackId}&usertoken=${tokenData.user_token}`;
            const result = await this.get(formattedUrl);
            let lyrics = result.message.body.subtitle.subtitle_body;
            let val = convertTextToDurationObject(lyrics);
            return val
        } catch (error) {
          console.log(error)
            throw new Error('Failed to retrieve lyrics');
        }
    }

    async getLyricsAlternative(title, artist, duration = null) {
        try {
            await this.checkTokenExpire();
            const tokenData = await this.loadToken();
            let formattedUrl = `${this.lyricsAlternative}&usertoken=${tokenData.user_token}&q_album=&q_artist=${artist}&q_artists=&track_spotify_id=&q_track=${title}`;
            if (duration !== null) {
                formattedUrl += `&q_duration=${duration}`;
            }
            const result = await this.get(formattedUrl);
            const lyrics = result.message.body.macro_calls['track.subtitles.get'].message.body.subtitle_list[0].subtitle.subtitle_body;
            const lrcLyrics = this.getLrcLyrics(lyrics);
            return lrcLyrics;
        } catch (error) {
            throw new Error('Failed to retrieve alternative lyrics');
        }
    }

    async searchTrack(query) {
        try {
            await this.checkTokenExpire();
            const tokenData = await this.loadToken();
            const formattedUrl = `${this.searchTermUrl}&q=${query}&usertoken=${tokenData.user_token}`;
            const result = await this.get(formattedUrl);
            if (!result.message.body.track_list) {
                throw new Error('No track found');
            }
            for (const track of result.message.body.track_list) {
                const trackName = `${track.track.track_name} ${track.track.artist_name}`;
                if (query.includes(trackName)) {
                    return track.track.track_id;
                }
            }
            return result.message.body.track_list[0].track.track_id;
        } catch (error) {
            throw new Error('Failed to search track');
        }
    }

    getLrcLyrics(lyrics) {
        let lrc = '';
        if (lyrics) {
            for (const item of lyrics) {
                const { minutes, seconds, hundredths, text } = item.time;
                lrc += `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]${text || '♪'}\n`;
            }
        }
        return lrc;
    }
}

const musix = new Musix();

app.get('/api', (req, res) => {
    res.send('Welcome to the MusixLyrics API!');
});

app.get('/api/lyrics/:trackId', async (req, res) => {
    try {
      const song = await musix.searchTrack(req.params.trackId);
        const lyrics = await musix.getLyrics(song);
        let cooked = {
          code: 200,
          message: "success",
          lyrics, 
        }
        res.type('json').send(JSON.stringify(cooked, null, 2) + '\n');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
