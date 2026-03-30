import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import path from "path";

const TELEGRAM_TOKEN = '8331817215:AAHBJ2AOvhVXrsIm79YK07c_0U_7tsNw4Es';
const RESEND_API_KEY = 're_Busn6VyK_2RbS25X9UZ3urxwkrPK9PgvZ';
const USER_EMAIL = 'sara.nimri01@gmail.com';

const resend = new Resend(RESEND_API_KEY);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/notify", async (req, res) => {
    const { events, preferences } = req.body;
    
    if (!events || events.length === 0) {
      return res.status(400).json({ error: "No events provided" });
    }

    let telegramSuccess = false;
    let emailSuccess = false;
    let errors: string[] = [];

    const newEvents = events.filter((e: any) => e.notificationStatus === 'pending_create' || e.isNotified === false);
    const updatedEvents = events.filter((e: any) => e.notificationStatus === 'pending_update');
    const deletedEvents = events.filter((e: any) => e.notificationStatus === 'pending_delete');

    let messageText = "TangoYoungNRW Schedule Updates:\n\n";
    
    if (newEvents.length > 0) {
      messageText += "🟢 NEW EVENTS:\n" + newEvents.map((e: any) => `- ${e.name} ${e.date ? `on ${e.date}` : ''} ${e.time ? `at ${e.time}` : ''}${e.isPublishedOnMeetup ? ' [Published on Meetup]' : ''}`).join('\n') + "\n\n";
    }
    if (updatedEvents.length > 0) {
      messageText += "🟡 UPDATED EVENTS:\n" + updatedEvents.map((e: any) => `- ${e.name} ${e.date ? `on ${e.date}` : ''} ${e.time ? `at ${e.time}` : ''}${e.isPublishedOnMeetup ? ' [Published on Meetup]' : ''}`).join('\n') + "\n\n";
    }
    if (deletedEvents.length > 0) {
      messageText += "🔴 DELETED EVENTS:\n" + deletedEvents.map((e: any) => `- ${e.name} ${e.date ? `on ${e.date}` : ''} ${e.time ? `at ${e.time}` : ''}${e.isPublishedOnMeetup ? ' [Published on Meetup]' : ''}`).join('\n') + "\n\n";
    }

    if (messageText === "TangoYoungNRW Schedule Updates:\n\n") {
       return res.json({ success: true, message: "No relevant updates to send." });
    }

    // Telegram
    if (preferences.telegram) {
      try {
        const updatesRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates`);
        const updates = await updatesRes.json();
        
        let chatId = null;
        if (updates.ok && updates.result.length > 0) {
          chatId = updates.result[updates.result.length - 1].message.chat.id;
        }

        if (chatId) {
          const sendRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: messageText
            })
          });
          const sendData = await sendRes.json();
          if (sendData.ok) telegramSuccess = true;
          else errors.push("Telegram send failed: " + sendData.description);
        } else {
          errors.push("Telegram: No chat ID found. Please send a message to your bot first.");
        }
      } catch (err: any) {
        errors.push("Telegram error: " + err.message);
      }
    }

    // Email (Resend)
    if (preferences.email) {
      try {
        const data = await resend.emails.send({
          from: 'TangoYoungNRW <onboarding@resend.dev>',
          to: USER_EMAIL,
          subject: 'TangoYoungNRW Schedule Updates',
          text: messageText,
        });
        if (data.error) {
          errors.push("Email error: " + data.error.message);
        } else {
          emailSuccess = true;
        }
      } catch (err: any) {
        errors.push("Email exception: " + err.message);
      }
    }

    res.json({ 
      success: true, 
      telegramSuccess, 
      emailSuccess, 
      errors 
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
