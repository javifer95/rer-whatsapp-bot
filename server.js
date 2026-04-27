const express = require('express');
const https = require('https');
const app = express();
app.use(express.json());

const VERIFY_TOKEN    = "rer_burgers_secret_2024";
const WA_TOKEN        = process.env.WA_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_KEY;
const EVENTS_PHONE    = "50247703115";

const conversations = {};
const customerStates = {};

app.get('/', (req, res) => res.send('RER Bot is alive!'));

app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const entry   = req.body?.entry?.[0];
    const change  = entry?.changes?.[0];
    const value   = change?.value;
    const message = value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const userPhone = message.from;
    const userName  = value?.contacts?.[0]?.profile?.name || "amigo";

    let userText = '';
    if (message.type === 'text') {
      userText = message.text.body.trim();
    } else if (message.type === 'interactive') {
      userText = message.interactive?.button_reply?.title ||
                 message.interactive?.list_reply?.title || '';
    } else {
      return res.sendStatus(200);
    }

    console.log(`📩 Message from ${userPhone} (${userName}): ${userText}`);

    if (!conversations[userPhone]) conversations[userPhone] = [];
    if (!customerStates[userPhone]) customerStates[userPhone] = 'start';

    const response = await handleMessage(userPhone, userName, userText);

    for (const msg of response) {
      await sendMessage(userPhone, msg);
      await sleep(800);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error:', error);
    res.sendStatus(500);
  }
});

async function handleMessage(phone, name, text) {
  const state = customerStates[phone];
  const lower = text.toLowerCase();

  // ── WELCOME / START ──────────────────────────────────────────
  if (state === 'start' || isGreeting(lower)) {
    customerStates[phone] = 'main_menu';
    return [
      textMsg(`¡Hola ${name}! 👋😊 Bienvenido a *RER Burgers*, donde hacemos las mejores hamburguesas de la Ciudad de Guatemala. 🍔🔥\n\n¿En qué te puedo ayudar hoy?`),
      menuButtons()
    ];
  }

  // ── MÁS OPCIONES ─────────────────────────────────────────────
  if (matchesOption(lower, ['más opciones', 'mas opciones', 'más', 'mas', 'otras opciones', 'mas_opciones'])) {
    customerStates[phone] = 'main_menu';
    return [extendedMenuButtons()];
  }

  // ── VER MENÚ — envía los 3 PDFs ──────────────────────────────
  if (matchesOption(lower, ['ver menú', 'ver menu', '🍔 ver menú', '1', 'menu', 'menú'])) {
    customerStates[phone] = 'after_menu';
    return [
      textMsg('¡Aquí están nuestros menús! 🍔✨ Te enviamos todo lo que tenemos:'),
      pdfMsg(
        'https://drive.google.com/uc?export=download&id=1ltggOCYMuPOcr6WuuqA00xIfCKjazYVW',
        '🍔 Menú Bocata Oakland Zona 10'
      ),
      pdfMsg(
        'https://drive.google.com/uc?export=download&id=1fiaH39C_6S8PWrjiry4UhhkRlwqyFzvF',
        '🍔 Menú Mistura Spazio Zona 15'
      ),
      pdfMsg(
        'https://drive.google.com/uc?export=download&id=15iy4jiEdQ-Rvm_0a-P8bfVG3UMjEVIdO',
        '🔥 Menú Smash Burgers'
      ),
      textMsg('📌 *Notas importantes:*\n\n🍗 Las Wings están disponibles *únicamente* en nuestro local de Bocata Oakland Zona 10.\n\n✨ También te enviamos el menú de nuestras nuevas y deliciosas *SMASH Burgers*, ¡disponibles en todas las ubicaciones!'),
      orderPromptButtons()
    ];
  }

  // ── HACER PEDIDO ─────────────────────────────────────────────
  if (matchesOption(lower, ['hacer pedido', 'hacer un pedido', '🛒 hacer pedido', '2', 'pedido', 'ordenar', 'order'])) {
    customerStates[phone] = 'order_type';
    return [
      textMsg('¡Perfecto! 🍔 ¿Tu pedido es para delivery o para recoger en el local?'),
      deliveryButtons()
    ];
  }

  // ── INFO PARA EVENTOS ─────────────────────────────────────────
  if (matchesOption(lower, ['información para eventos', 'informacion para eventos', '🎉 info para eventos', 'eventos', '3', 'evento'])) {
    customerStates[phone] = 'collecting_event';
    return [
      textMsg('¡Nos encantaría ser parte de tu evento! 🎉🍔\n\nPor favor compártenos la siguiente información:\n\n1️⃣ Nombre y apellido\n2️⃣ Número de teléfono\n3️⃣ Número de personas\n4️⃣ Fecha del evento\n5️⃣ Hora del evento\n\nHaremos todo lo posible para cubrir tu evento, aunque hay restricciones de disponibilidad y ubicación.')
    ];
  }

  // ── HORARIOS ──────────────────────────────────────────────────
  if (matchesOption(lower, ['horarios', '⏰ horarios', '4', 'horas', 'hora', 'horario', 'cuando abren', 'a que hora'])) {
    customerStates[phone] = 'main_menu';
    return [
      textMsg('⏰ *Nuestros horarios:*\n\n📍 *Mistura Spazio Zona 15*\nLunes a Domingo: 12:00 PM – 9:00 PM\n\n📍 *Bocata Oakland Place Zona 10*\nLunes a Domingo: 12:00 PM – 9:00 PM'),
      moreHelpButtons()
    ];
  }

  // ── HABLAR CON ASESOR ─────────────────────────────────────────
  if (matchesOption(lower, ['hablar con asesor', '💬 hablar con asesor', 'asesor', '5', 'hablar', 'agente', 'persona'])) {
    customerStates[phone] = 'main_menu';
    return [
      textMsg('¡Con gusto! 😊 Puedes comunicarte directamente con nuestros locales:\n\n📍 *Mistura Spazio Zona 15*\n📞 +502 0000-0000\n\n📍 *Bocata Oakland Place Zona 10*\n📞 +502 0000-0000'),
      moreHelpButtons()
    ];
  }

  // ── AFTER MENU — ¿quiere ordenar? ────────────────────────────
  if (state === 'after_menu') {
    if (matchesOption(lower, ['sí', 'si', 'yes', 'quiero', 'ordenar', 'hacer pedido', '✅ sí, quiero ordenar'])) {
      customerStates[phone] = 'order_type';
      return [
        textMsg('¡Excelente elección! 🍔🔥 ¿Tu pedido es para delivery o para recoger en el local?'),
        deliveryButtons()
      ];
    } else {
      customerStates[phone] = 'main_menu';
      return [moreHelpButtons()];
    }
  }

  // ── ORDER TYPE ────────────────────────────────────────────────
  if (state === 'order_type') {
    if (matchesOption(lower, ['delivery', '🛵 delivery', 'domicilio', 'a domicilio', 'envío', 'envio'])) {
      customerStates[phone] = 'main_menu';
      return [
        textMsg('🛵 Para pedidos a domicilio puedes ordenar a través de:\n\n🟢 *Uber Eats*\nhttps://www.ubereats.com/gt-en/store/rer/6WztAvp6TyyOcWtICpq3GQ\n\n🟡 *PedidosYa*\nhttps://www.pedidosya.com.gt/restaurantes/guatemala-city/rer-burgers-menu'),
        moreHelpButtons()
      ];
    } else if (matchesOption(lower, ['pickup', '🏃 para llevar', 'recoger', 'para llevar', 'llevar', 'ir a recoger'])) {
      customerStates[phone] = 'main_menu';
      return [
        textMsg('🏃 ¡Perfecto! Para pedidos para llevar puedes llamar directamente a nuestros locales:\n\n📍 *Mistura Spazio Zona 15*\n📞 +502 0000-0000\n\n📍 *Bocata Oakland Place Zona 10*\n📞 +502 0000-0000'),
        moreHelpButtons()
      ];
    }
  }

  // ── COLLECTING EVENT INFO ─────────────────────────────────────
  if (state === 'collecting_event') {
    customerStates[phone] = 'main_menu';
    // Enviar info del evento al equipo de RER vía WhatsApp
    await sendMessage(EVENTS_PHONE, textMsg(
      `🎉 *Nueva solicitud de evento*\n\nDe: ${name}\nTeléfono: ${phone}\n\nInformación del evento:\n${text}`
    ));
    return [
      textMsg('¡Muchas gracias por tu interés! 🎉🍔 Alguien del equipo de *RER Burgers* se estará comunicando contigo muy pronto para confirmar todos los detalles.'),
      moreHelpButtons()
    ];
  }

  // ── MORE HELP ─────────────────────────────────────────────────
  if (matchesOption(lower, ['✅ sí, necesito ayuda', 'sí, necesito ayuda', 'si, necesito ayuda', 'sí', 'si', 'más ayuda', 'mas ayuda', 'yes'])) {
    customerStates[phone] = 'main_menu';
    return [
      textMsg('¡Claro! 😊 ¿En qué más te puedo ayudar?'),
      menuButtons()
    ];
  }

  if (matchesOption(lower, ['👋 no, gracias', 'no, gracias', 'no gracias', 'no', 'estoy bien', 'listo'])) {
    customerStates[phone] = 'start';
    conversations[phone] = [];
    return [
      textMsg('¡Perfecto! 😊 Gracias por contactar a *RER Burgers* 🍔 ¡Que tengas un excelente día! 👋')
    ];
  }

  // ── FALLBACK — Claude AI ──────────────────────────────────────
  conversations[phone].push({ role: 'user', content: text });
  const aiReply = await askClaude(conversations[phone]);
  conversations[phone].push({ role: 'assistant', content: aiReply });
  if (conversations[phone].length > 20) {
    conversations[phone] = conversations[phone].slice(-20);
  }
  return [textMsg(aiReply), menuButtons()];
}

// ── MESSAGE BUILDERS ──────────────────────────────────────────
function textMsg(body) {
  return { type: 'text', text: { body, preview_url: false } };
}

function pdfMsg(url, filename) {
  return {
    type: 'document',
    document: {
      link: url,
      filename: filename
    }
  };
}

function menuButtons() {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '¿Qué deseas hacer? 👇' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'ver_menu',     title: '🍔 Ver menú' } },
          { type: 'reply', reply: { id: 'hacer_pedido', title: '🛒 Hacer pedido' } },
          { type: 'reply', reply: { id: 'mas_opciones', title: '➕ Más opciones' } }
        ]
      }
    }
  };
}

function extendedMenuButtons() {
  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: 'Selecciona una opción 👇' },
      action: {
        button: '📋 Ver opciones',
        sections: [{
          title: 'Menú principal',
          rows: [
            { id: 'ver_menu',     title: '🍔 Ver menú' },
            { id: 'hacer_pedido', title: '🛒 Hacer pedido' },
            { id: 'eventos',      title: '🎉 Info para eventos' },
            { id: 'horarios',     title: '⏰ Horarios' },
            { id: 'asesor',       title: '💬 Hablar con asesor' }
          ]
        }]
      }
    }
  };
}

function deliveryButtons() {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '¿Cómo quieres tu pedido? 🍔' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'delivery', title: '🛵 Delivery' } },
          { type: 'reply', reply: { id: 'pickup',   title: '🏃 Para llevar' } }
        ]
      }
    }
  };
}

function orderPromptButtons() {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '¿Deseas hacer un pedido? 🍔' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'si_pedido', title: '✅ Sí, quiero ordenar' } },
          { type: 'reply', reply: { id: 'no_pedido', title: '❌ No por ahora' } }
        ]
      }
    }
  };
}

function moreHelpButtons() {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '¿Necesitas algo más? 😊' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'si_ayuda', title: '✅ Sí, necesito ayuda' } },
          { type: 'reply', reply: { id: 'no_ayuda', title: '👋 No, gracias' } }
        ]
      }
    }
  };
}

// ── SEND MESSAGE ──────────────────────────────────────────────
function sendMessage(to, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      ...payload
    });

    const options = {
      hostname: 'graph.facebook.com',
      path: `/v18.0/${PHONE_NUMBER_ID}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res2) => {
      let data = '';
      res2.on('data', chunk => data += chunk);
      res2.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) console.error('WhatsApp error:', parsed.error);
        } catch(e) {}
        resolve();
      });
    });

    req.on('error', (e) => { console.error('Request error:', e); resolve(); });
    req.write(body);
    req.end();
  });
}

// ── ASK CLAUDE (fallback) ─────────────────────────────────────
function askClaude(conversationHistory) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `Eres el asistente virtual de RER Burgers 🍔, un restaurante de hamburguesas artesanales con dos locales en Guatemala City: Mistura Spazio Zona 15 y Bocata Oakland Place Zona 10. Horario: Lunes a Domingo 12PM-9PM. Tono: casual, divertido, emocionado. Responde SIEMPRE en español. Máximo 3 líneas. Si no sabes algo di: "Para más info llámanos 📞 Spazio: +502 0000-0000 / Oakland: +502 0000-0000".`,
      messages: conversationHistory
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res2) => {
      let data = '';
      res2.on('data', chunk => data += chunk);
      res2.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) resolve('Disculpa, tuve un problema. Llámanos 📞 Spazio: +502 0000-0000 / Oakland: +502 0000-0000 🙏');
          else resolve(parsed.content[0].text);
        } catch(e) {
          resolve('Disculpa, tuve un problema. Llámanos 📞 Spazio: +502 0000-0000 / Oakland: +502 0000-0000 🙏');
        }
      });
    });

    req.on('error', () => resolve('Disculpa, tuve un problema. Llámanos 📞 +502 0000-0000 🙏'));
    req.write(body);
    req.end();
  });
}

// ── HELPERS ───────────────────────────────────────────────────
function isGreeting(text) {
  return ['hola', 'buenos días', 'buenos dias', 'buenas tardes', 'buenas noches',
          'buenas', 'hey', 'hi', 'hello', 'buen día', 'buen dia'].some(g => text.includes(g));
}

function matchesOption(text, options) {
  return options.some(o => text.includes(o.toLowerCase()));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── START SERVER ──────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('🍔 RER WhatsApp Bot running on port ' + PORT));
