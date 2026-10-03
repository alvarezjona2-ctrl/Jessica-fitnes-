import { GoogleGenAI } from '@google/genai';

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
   Responde SIEMPRE en formato JSON puro con estos campos exactos:
   {
     "verdict": "SEGURO" | "MODERACION" | "NO_RECOMENDADO",
     "title": "Título corto y amigable con emoji",
     "reason": "Explicación clara y concisa (máximo 2-3 frases) de por qué es bueno o malo para su progreso y si contiene o no ingredientes prohibidos.",
     "portionTip": "Consejo de porción recomendada o advertencia",
     "alternative": "Sugerencia saludable permitida o palabras de ánimo."
   }`;

export default async function(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') {
    return new Response('OK', { status: 200, headers });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers });
  }

  try {
    const { text, imageBase64, mimeType } = JSON.parse(await req.text() || '{}');

    if (!text && !imageBase64) {
      return Response.json(
        { error: 'Debes proporcionar una foto o una pregunta en texto.' },
        { status: 400, headers }
      );
    }

    const parts = [];
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
      ? `Pregunta de Jessica: "${text}". Analiza este alimento/comida según las reglas y responde en JSON puro.`
      : 'Analiza este plato o alimento de la foto según las reglas y responde en JSON puro.';

    parts.push({ text: promptText });

    const ai = new GoogleGenAI({});
    const data = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ parts }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json'
      }
    });

    let textResponse = data.text || '';
    
    // Limpiar markdown si el modelo lo incluye
    textResponse = textResponse.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    const result = JSON.parse(textResponse);
    return Response.json(result, { status: 200, headers });
  } catch (err) {
    return Response.json(
      { error: Number.isInteger(err.status) ? `Error Google API (${err.status})` : 'Error al consultar a la Nutri-IA' },
      { status: 500, headers }
    );
  }
};
