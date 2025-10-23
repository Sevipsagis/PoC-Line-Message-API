import express, { Request, Response, NextFunction } from 'express';
import * as line from '@line/bot-sdk';

// --- (1) การตั้งค่า Config ---
// Bun จะโหลด .env ให้อัตโนมัติ
const lineConfig: line.MiddlewareConfig & line.ClientConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

// สร้าง LINE Client และ Middleware
const client = new line.Client(lineConfig);
const middleware = line.middleware(lineConfig);

// สร้าง Express App
const app = express();
const port = process.env.PORT || 8080;

// --- (2) ส่วนรับ Webhook จาก LINE ---
// Endpoint นี้ LINE จะยิงมาหาเรา
app.post(
  '/webhook',
  middleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const events: line.WebhookEvent[] = req.body.events;

      // วนลูปจัดการทุก Events ที่ LINE ส่งมา
      const results = await Promise.all(
        events.map(handleEvent)
      );

      // ส่ง 200 OK กลับไปให้ LINE
      res.json(results);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(err.message);
      } else {
        console.error(err);
      }
      res.status(500).end();
    }
  }
);

// ฟังก์ชันแยกจัดการ Event
async function handleEvent(event: line.WebhookEvent): Promise<any> {
  // เราจะสนใจเฉพาะ Event ที่มี source.userId
  if (!event.source || !event.source.userId) {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  console.log(`ได้รับ Event จาก userId: ${userId}`);

  // ---- นี่คือส่วนสำคัญ ----
  //
  // **คุณต้องเอา `userId` นี้ไปเก็บไว้ใน Database (เช่น PostgreSQL, MySQL, SQLite, Firestore ฯลฯ)**
  // เพื่อที่คุณจะรู้ว่ามี User คนไหนบ้าง และสามารถส่งข้อความหาเขาในอนาคตได้
  //
  // เช่น saveToDatabase(userId);
  //
  // -------------------------

  // จัดการ Event ประเภทต่างๆ
  switch (event.type) {
    // เมื่อ User แอดเพื่อน
    case 'follow':
      console.log(`User ${userId} แอดบอทเป็นเพื่อน`);
      // อาจจะส่งข้อความต้อนรับกลับไป
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'ขอบคุณที่แอดเราเป็นเพื่อน!',
      });

    // เมื่อ User ส่งข้อความ
    case 'message':
      if (event.message.type === 'text') {
        console.log(`User ${userId} ส่งข้อความ: ${event.message.text}`);
        // นี่คือการ "ตอบกลับ" (Reply) ไม่ใช่ "ส่ง" (Push)
        // การ Reply ทำได้ทันที แต่มีอายุ (Token อยู่ได้แป๊บเดียว)
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `คุณพิมพ์ว่า: ${event.message.text}`,
        });
      }
      break;

    // เมื่อ User บล็อกบอท
    case 'unfollow':
      console.log(`User ${userId} บล็อกบอท`);
      // ตรงนี้ควรไปลบ userId ออกจาก Database ของคุณ
      // (เพราะส่งข้อความไปหาคนที่บล็อกเราไม่ได้แล้ว)
      break;

    default:
      return Promise.resolve(null);
  }
}

// --- (3) ส่วนส่งข้อความ 1-to-1 (Push API) ---
// Endpoint นี้เราสร้างขึ้นมาเองเพื่อทดสอบการ "Push"
// ในการใช้งานจริง Endpoint นี้อาจจะถูกยิงโดยระบบ Admin ของคุณ
app.post(
  '/send-message',
  express.json(), // ใช้ express.json() เพื่ออ่าน req.body
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { targetUserId, messageText } = req.body;

      if (!targetUserId || !messageText) {
        res.status(400).json({ error: 'ต้องการ targetUserId และ messageText' });
        return;
      }

      // นี่คือการใช้ Push API
      await client.pushMessage(targetUserId, {
        type: 'text',
        text: messageText,
      });

      console.log(`ส่งข้อความ Push "${messageText}" ไปยัง ${targetUserId} สำเร็จ`);
      res.json({ success: true, message: 'ส่งข้อความแล้ว' });
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(err.message);
      } else {
        console.error(err);
      }
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งข้อความ' });
    }
  }
);

// Middleware สำหรับจัดการ Error (ควรมี)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof line.SignatureValidationFailed) {
    res.status(401).send(err.message);
    return;
  }
  if (err instanceof line.JSONParseError) {
    res.status(400).send(err.message);
    return;
  }
  console.error(err);
  res.status(500).end();
});

// เริ่ม Server
app.listen(port, () => {
  console.log(`🚀 Server กำลังรันที่ http://localhost:${port}`);
});