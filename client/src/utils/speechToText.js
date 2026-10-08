// Speech to Text Utility using Web Speech API with PyThaiASR reference
// (https://github.com/PyThaiNLP/pythaiasr)

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
