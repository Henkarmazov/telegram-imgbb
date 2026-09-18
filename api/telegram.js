import axios from "axios";

const TELEGRAM =
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const IMGBB =
  "https://api.imgbb.com/1/upload";


export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Method not allowed"
    });
  }

  try {

    const update = req.body;

    /*
     * =========================
     * MESSAGE
     * =========================
     */

    if (update.message) {

      const message =
        update.message;

      const chatId =
        message.chat.id;


      // /start
      if (
        message.text === "/start"
      ) {

        await sendMessage(
          chatId,
          `👋 <b>ImgBB Uploader Bot</b>

Kirim gambar ke sini dan bot akan menguploadnya ke ImgBB.

Setelah gambar dikirim, kamu bisa memilih berapa lama gambar tersebut disimpan.

📦 Maksimal file: 32 MB`,
          {
            parse_mode: "HTML"
          }
        );

        return res.json({
          ok: true
        });
      }


      /*
       * FOTO
       */

      if (
        message.photo &&
        message.photo.length
      ) {

        const photos =
          message.photo;

        const largest =
          photos[photos.length - 1];

        const fileId =
          largest.file_id;


        /*
         * Simpan file_id sementara
         *
         * Untuk versi tanpa database,
         * kita encode file_id ke callback_data.
         */

        await sendMessage(
          chatId,
          "🖼️ <b>Gambar diterima!</b>\n\nPilih berapa lama gambar ini disimpan:",
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⏱️ 1 Menit",
                    callback_data:
                      `upload|${fileId}|60`
                  },
                  {
                    text: "⏱️ 5 Menit",
                    callback_data:
                      `upload|${fileId}|300`
                  }
                ],
                [
                  {
                    text: "🕐 1 Jam",
                    callback_data:
                      `upload|${fileId}|3600`
                  },
                  {
                    text: "📅 1 Hari",
                    callback_data:
                      `upload|${fileId}|86400`
                  }
                ],
                [
                  {
                    text: "📅 7 Hari",
                    callback_data:
                      `upload|${fileId}|604800`
                  },
                  {
                    text: "📅 30 Hari",
                    callback_data:
                      `upload|${fileId}|2592000`
                  }
                ],
                [
                  {
                    text: "📅 180 Hari",
                    callback_data:
                      `upload|${fileId}|15552000`
                  }
                ],
                [
                  {
                    text: "♾️ Permanen",
                    callback_data:
                      `upload|${fileId}|0`
                  }
                ]
              ]
            }
          }
        );

        return res.json({
          ok: true
        });
      }


      /*
       * Jika bukan foto
       */

      await sendMessage(
        chatId,
        "🖼️ Kirim gambar untuk diupload ke ImgBB."
      );

      return res.json({
        ok: true
      });
    }


    /*
     * =========================
     * CALLBACK BUTTON
     * =========================
     */

    if (
      update.callback_query
    ) {

      const callback =
        update.callback_query;

      const data =
        callback.data || "";

      const callbackId =
        callback.id;

      const chatId =
        callback.message.chat.id;


      if (
        !data.startsWith(
          "upload|"
        )
      ) {
        return res.json({
          ok: true
        });
      }


      const parts =
        data.split("|");

      const fileId =
        parts[1];

      const expiration =
        Number(parts[2]);


      /*
       * Loading
       */

      await answerCallback(
        callbackId,
        "⏳ Mengupload gambar..."
      );


      await editMessage(
        chatId,
        callback.message.message_id,
        "⏳ <b>Sedang mengupload ke ImgBB...</b>",
        {
          parse_mode: "HTML"
        }
      );


      try {

        /*
         * Ambil file Telegram
         */

        const fileInfo =
          await telegramRequest(
            "getFile",
            {
              file_id: fileId
            }
          );


        const filePath =
          fileInfo.file_path;


        const telegramFile =
          await axios.get(
            `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`,
            {
              responseType:
                "arraybuffer"
            }
          );


        const buffer =
          Buffer.from(
            telegramFile.data
          );


        /*
         * Upload ke ImgBB
         */

        const form =
          new URLSearchParams();

        form.append(
          "key",
          process.env.IMGBB_API_KEY
        );

        form.append(
          "image",
          buffer.toString("base64")
        );


        if (expiration > 0) {

          form.append(
            "expiration",
            String(expiration)
          );

        }


        const response =
          await axios.post(
            IMGBB,
            form.toString(),
            {
              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded"
              },

              timeout: 50000
            }
          );


        const data =
          response.data;


        if (
          !data.success
        ) {

          throw new Error(
            "ImgBB gagal menerima gambar."
          );

        }


        const image =
          data.data;


        const durationText =
          getDurationText(
            expiration
          );


        await editMessage(
          chatId,
          callback.message.message_id,
          `✅ <b>Upload berhasil!</b>

🔗 <a href="${escapeHtml(image.url)}">Buka Gambar</a>

⏱️ Masa aktif: <b>${durationText}</b>

📁 ${escapeHtml(image.image.filename)}

📦 ${formatBytes(image.size)}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: false,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "🔗 Buka Gambar",
                    url: image.url
                  }
                ],
                [
                  {
                    text: "🖼️ Upload Lagi",
                    callback_data:
                      "again"
                  }
                ]
              ]
            }
          }
        );

      } catch (error) {

        console.error(
          "UPLOAD ERROR:",
          error.response?.data ||
          error.message
        );


        await editMessage(
          chatId,
          callback.message.message_id,
          `❌ <b>Upload gagal</b>

${escapeHtml(
  error.response?.data?.error?.message ||
  error.message ||
  "Terjadi kesalahan."
)}`,
          {
            parse_mode: "HTML"
          }
        );
      }


      return res.json({
        ok: true
      });
    }


    return res.json({
      ok: true
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}


/*
 * =========================
 * TELEGRAM FUNCTIONS
 * =========================
 */

async function telegramRequest(
  method,
  params
) {

  const response =
    await axios.post(
      `${TELEGRAM}/${method}`,
      params
    );

  if (
    !response.data.ok
  ) {
    throw new Error(
      response.data.description ||
      "Telegram API error"
    );
  }

  return response.data.result;
}


async function sendMessage(
  chatId,
  text,
  extra = {}
) {

  return telegramRequest(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      ...extra
    }
  );
}


async function editMessage(
  chatId,
  messageId,
  text,
  extra = {}
) {

  return telegramRequest(
    "editMessageText",
    {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...extra
    }
  );
}


async function answerCallback(
  callbackId,
  text
) {

  return telegramRequest(
    "answerCallbackQuery",
    {
      callback_query_id:
        callbackId,
      text
    }
  );
}


/*
 * =========================
 * HELPERS
 * =========================
 */

function getDurationText(
  seconds
) {

  if (seconds === 0) {
    return "Permanen";
  }

  if (seconds < 3600) {
    return `${seconds / 60} menit`;
  }

  if (seconds < 86400) {
    return `${seconds / 3600} jam`;
  }

  return `${seconds / 86400} hari`;
}


function formatBytes(
  bytes
) {

  if (!bytes) {
    return "0 Bytes";
  }

  const units = [
    "Bytes",
    "KB",
    "MB",
    "GB"
  ];

  const i =
    Math.floor(
      Math.log(bytes) /
      Math.log(1024)
    );

  return `${(
    bytes /
    Math.pow(1024, i)
  ).toFixed(2)} ${units[i]}`;
}


function escapeHtml(
  text
) {

  return String(text)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}