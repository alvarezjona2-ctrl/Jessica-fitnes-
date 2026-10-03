import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Permitir payloads de fotos en Base64
  app.use(express.json({ limit: '25mb' }));

  // Servir imágenes estáticas locales (ícono y foto de Jessica)
  app.use(express.static(path.resolve(__dirname, 'public')));
  app.use('/img', express.static(path.resolve(__dirname, 'img')));

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const SYSTEM_INSTRUCTION = `Eres la Nutri-Coach personal y cariñosa de Jessica en su plan de transformación física.
Tu misión es decirle a Jessica si un alimento, comida, platillo o snack es seguro y adecuado para su progreso, tanto si te envía una foto como si te pregunta por texto.

PERFIL Y REGLAS ESTRICTAS DE JESSICA:
1. RESTRICCIONES MÉDICAS Y DE GUSTO ABSOLUTAS (PROHIBIDO TOTALMENTE):
   🚫 CERO CEBOLLA (ningún tipo, ni cruda ni cocida ni en polvo ni salsas).
   🚫 CERO TOMATE (nada de jitomate, salsas rojas con tomate, pasta de tomate, etc.).
   🚫 CERO PAPAYA.
   🚫 CERO GUAYABA.
   🚫 CERO HÍGADO (ningún tipo de hígado animal).
   Si detectas o sospechas cualquiera de estos ingredientes, tu veredicto DEBE ser "NO_RECOMENDADO" y advertirle claramente del ingrediente prohibido.

2. OBJETIVOS DEL PLAN:
   - Calorías diarias: ~1,900 kcal.
   - Recomposición corporal: Aumentar masa muscular en glúteos y piernas, reducir grasa en cintura y abdomen.
   - Macros clave: Proteína alta (115-120g/día), grasas moderadas saludables (55-65g), carbohidratos limpios (220-240g: arroz, avena, papa, pasta).

3. FORMATO DE RESPUESTA:
   Responde SIEMPRE en formato JSON estructurado con estos campos exactos:
   {
     "verdict": "SEGURO" | "MODERACION" | "NO_RECOMENDADO",
     "title": "Título corto y amigable con emoji (ej. '¡Excelente opción proteica! 🌸' o '¡Cuidado con la salsa! 🚫')",
     "reason": "Explicación clara y concisa (máximo 2-3 frases) de por qué es bueno o malo para su progreso y si contiene o no ingredientes prohibidos.",
     "portionTip": "Consejo de porción recomendada o advertencia (ej. 'Porción ideal: 1 taza' o 'Evita consumir la salsa roja')",
     "alternative": "Sugerencia saludable permitida si el veredicto es MODERACION o NO_RECOMENDADO, o palabras de ánimo si es SEGURO."
   }
   Tono: Cariñoso, empático, motivador, estilo Kawaii / iOS pastel, claro y directo.`;

  // Endpoint de descarga de ZIP para Netlify
  app.get('/site-netlify.zip', (_req, res) => {
    res.download(path.resolve(__dirname, 'site-netlify.zip'), 'site-netlify.zip');
  });

  // Endpoint para guardar los archivos oficiales reales (ícono y foto de Jessica)
  app.post('/api/upload-official-assets', async (req, res) => {
    try {
      const { iconBase64, metaBase64 } = req.body;
      const fs = await import('fs');

      if (iconBase64) {
        const clean = iconBase64.replace(/^data:[^;]+;base64,/, '');
        const buf = Buffer.from(clean, 'base64');
        const paths = [
          path.resolve(__dirname, 'icon.png'),
          path.resolve(__dirname, 'public', 'icon.png'),
          path.resolve(__dirname, 'img', 'icon.png'),
          path.resolve(__dirname, 'public', 'img', 'icon.png'),
          path.resolve(__dirname, 'dist', 'icon.png'),
          path.resolve(__dirname, 'dist', 'img', 'icon.png'),
        ];
        paths.forEach(p => {
          try {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, buf);
          } catch (e) {}
        });
      }

      if (metaBase64) {
        const clean = metaBase64.replace(/^data:[^;]+;base64,/, '');
        const buf = Buffer.from(clean, 'base64');
        const paths = [
          path.resolve(__dirname, 'meta_jessica.jpg'),
          path.resolve(__dirname, 'public', 'meta_jessica.jpg'),
          path.resolve(__dirname, 'img', 'meta_jessica.jpg'),
          path.resolve(__dirname, 'public', 'img', 'meta_jessica.jpg'),
          path.resolve(__dirname, 'dist', 'meta_jessica.jpg'),
          path.resolve(__dirname, 'dist', 'img', 'meta_jessica.jpg'),
        ];
        paths.forEach(p => {
          try {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, buf);
          } catch (e) {}
        });
      }

      return res.json({ success: true, message: 'Imágenes oficiales guardadas con éxito.' });
    } catch (err: any) {
      console.error('Error guardando imágenes oficiales:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Endpoint de Nutri-IA
  app.post('/api/check-food', async (req, res) => {
    try {
      const { text, imageBase64, mimeType } = req.body;

      if (!text && !imageBase64) {
        return res.status(400).json({ error: 'Debes proporcionar una foto o una pregunta en texto.' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY no está configurada en el servidor. Configúrala en los Secrets de AI Studio.',
        });
      }

      const parts: any[] = [];

      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType || 'image/jpeg',
          },
        });
      }

      const promptText = text
        ? `Pregunta de Jessica: "${text}". Analiza este alimento/comida y responde en el formato JSON establecido.`
        : 'Analiza este plato o alimento de la foto para Jessica y responde en el formato JSON establecido.';

      parts.push({ text: promptText });

      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: { parts },
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  verdict: {
                    type: Type.STRING,
                    description: 'Debe ser SEGURO, MODERACION o NO_RECOMENDADO',
                  },
                  title: {
                    type: Type.STRING,
                    description: 'Título corto amigable con emoji',
                  },
                  reason: {
                    type: Type.STRING,
                    description: 'Explicación clara en 2-3 frases',
                  },
                  portionTip: {
                    type: Type.STRING,
                    description: 'Consejo de porción o advertencia',
                  },
                  alternative: {
                    type: Type.STRING,
                    description: 'Alternativa saludable o mensaje de ánimo',
                  },
                },
                required: ['verdict', 'title', 'reason', 'portionTip', 'alternative'],
              },
            },
          });
          if (response) break;
        } catch (e: any) {
          if (attempt === 2) throw e;
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      if (!response) {
        throw new Error('No se recibió respuesta del modelo de IA.');
      }

      const parsed = JSON.parse(response.text || '{}');
      return res.json(parsed);
    } catch (err: any) {
      console.error('Error en /api/check-food:', err);
      return res.status(500).json({
        error: 'Hubo un error al consultar a la Nutri-IA. Intenta nuevamente.',
        details: err?.message || String(err),
      });
    }
  });

  // Modo desarrollo o producción
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
  });
}

startServer();
