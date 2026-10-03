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

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: 'OK' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { text, imageBase64, mimeType } = JSON.parse(event.body || '{}');

    if (!text && !imageBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Debes proporcionar una foto o una pregunta en texto.' }),
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Falta configurar la variable GEMINI_API_KEY en Netlify (Environment variables).' }),
      };
    }

    const parts = [];
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      parts.push({
        inline_data: {
          data: cleanBase64,
          mime_type: mimeType || 'image/jpeg',
        },
      });
    }

    const promptText = text
      ? `Pregunta de Jessica: "${text}". Analiza este alimento/comida según las reglas y responde en JSON puro.`
      : 'Analiza este plato o alimento de la foto según las reglas y responde en JSON puro.';

    parts.push({ text: promptText });

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const apiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents: [
          {
            parts: parts
          }
        ],
        generationConfig: {
          response_mime_type: 'application/json'
        }
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      let parsedErr = {};
      try { parsedErr = JSON.parse(errText); } catch (e) {}
      const errMsg = parsedErr.error?.message || `Error Google API (${apiRes.status})`;
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: errMsg })
      };
    }

    const data = await apiRes.json();
    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Limpiar markdown si el modelo lo incluye
    textResponse = textResponse.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    const result = JSON.parse(textResponse);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Error al consultar a la Nutri-IA' }),
    };
  }
};
