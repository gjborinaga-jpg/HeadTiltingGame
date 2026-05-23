import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('ERROR: GOOGLE_API_KEY environment variable not set');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Backend is running ✅' });
});

// Generate curriculum endpoint
app.post('/api/generate-curriculum', async (req, res) => {
  try {
    const systemPrompt = "Act as an expert English teacher. Generate 10 Present Perfect tense grammar questions for students in Japan. Format the response as a JSON array of objects. Each object must have: 'q' (the question text), 'a' (option text), 'b' (option text), 'correct' (either 'a' or 'b'), and 'prompt' (a detailed physical scene description for image generation). Use friendly and clear language.";
    const userQuery = "Generate 10 challenging Present Perfect questions. Include some based in Hokkaido and some general grammar checks.";

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent({
      contents: [{ parts: [{ text: userQuery }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              q: { type: "STRING" },
              a: { type: "STRING" },
              b: { type: "STRING" },
              correct: { type: "STRING" },
              prompt: { type: "STRING" }
            },
            required: ["q", "a", "b", "correct", "prompt"]
          }
        }
      },
      systemInstruction: { parts: [{ text: systemPrompt }] }
    });

    const responseText = result.response.text();
    const questions = JSON.parse(responseText);
    
    res.json({ success: true, questions });
  } catch (error) {
    console.error('Error generating curriculum:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get AI explanation endpoint
app.post('/api/get-explanation', async (req, res) => {
  try {
    const { question, userChoice, correctChoice } = req.body;

    if (!question || !userChoice || !correctChoice) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const prompt = `A student answered "${userChoice}" for the question "${question}". The correct answer is "${correctChoice}". Explain briefly and kindly why the correct answer is right and why "${userChoice}" was wrong in the context of Present Perfect tense. Keep it under 2 sentences.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent(prompt);
    const explanation = result.response.text();

    res.json({ success: true, explanation });
  } catch (error) {
    console.error('Error getting explanation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Text-to-speech endpoint
app.post('/api/speak-question', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, error: 'Missing text field' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Read this grammar question clearly: ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }
        }
      })
    });

    const data = await response.json();

    if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
      const audioData = data.candidates[0].content.parts[0].inlineData.data;
      const mimeType = data.candidates[0].content.parts[0].inlineData.mimeType;
      
      res.json({ success: true, audioData, mimeType });
    } else {
      throw new Error('Invalid TTS response');
    }
  } catch (error) {
    console.error('Error generating speech:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate image endpoint
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Missing prompt field' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: prompt }],
        parameters: { sampleCount: 1 }
      })
    });

    const data = await response.json();

    if (data.predictions?.[0]?.bytesBase64Encoded) {
      const imageData = data.predictions[0].bytesBase64Encoded;
      res.json({ success: true, imageData });
    } else {
      throw new Error('Invalid image generation response');
    }
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log('✅ Endpoints available:');
  console.log('  POST /api/generate-curriculum');
  console.log('  POST /api/get-explanation');
  console.log('  POST /api/speak-question');
  console.log('  POST /api/generate-image');
});
