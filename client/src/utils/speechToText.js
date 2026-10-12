// ตอบด้วยเสียง — ใช้ Web Speech API ที่ติดมากับเบราว์เซอร์เอง (window.SpeechRecognition /
// webkitSpeechRecognition) ไม่ได้เพิ่ม library หรือเรียกบริการภายนอกในโค้ดนี้เลย — คอมเมนต์เดิมที่อ้างถึง
// PyThaiASR (https://github.com/PyThaiNLP/pythaiasr) คลาดเคลื่อน: ไลบรารีนั้นเป็นโมเดล ASR ภาษาไทยที่รันใน
// Python แยกต่างหาก ไม่มีโค้ดหรือโมเดลจากที่นั่นถูกใช้ในไฟล์นี้จริง — บน Chrome การแปลงเสียงเป็นข้อความ
// (webkitSpeechRecognition) เบราว์เซอร์จะส่งเสียงที่พูดไปประมวลผลที่เซิร์ฟเวอร์ของ Google เป็นกลไกภายใน
// ของเบราว์เซอร์เอง (ดูเครดิตใน README.md)

export function createSpeechRecognizer({ onResult, onError, onEnd }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    return {
      supported: false,
      start: () => onError && onError("STT_NOT_SUPPORTED"),
      stop: () => {},
    };
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "th-TH";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    if (onResult && transcript) {
      onResult(transcript);
    }
  };

  recognition.onerror = (err) => {
    if (onError) onError(err.error || "STT_ERROR");
  };

  recognition.onend = () => {
    if (onEnd) onEnd();
  };

  return {
    supported: true,
    start: () => {
      try {
        recognition.start();
      } catch (err) {
        if (onError) onError(err.message);
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch {}
    },
  };
}
