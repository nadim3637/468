
export const getAvailableVoices = (): Promise<SpeechSynthesisVoice[]> => {
    if (!('speechSynthesis' in window)) {
        return Promise.resolve([]);
    }
    
    return new Promise((resolve) => {
        let voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
            return;
        }
        
        window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            resolve(voices);
        };
        
        setTimeout(() => {
             resolve(window.speechSynthesis.getVoices());
        }, 2000);
    });
};

export const getIndianVoices = async () => {
    const voices = await getAvailableVoices();
    // Prioritize Hindi and Indian English
    return voices.filter(v => 
        v.lang === 'hi-IN' || 
        v.lang === 'en-IN' || 
        v.name.toLowerCase().includes('india') || 
        v.name.toLowerCase().includes('hindi')
    );
};

export const setPreferredVoice = (voiceURI: string) => {
    localStorage.setItem('nst_preferred_voice_uri', voiceURI);
};

export const getPreferredVoice = async (): Promise<SpeechSynthesisVoice | undefined> => {
    const uri = localStorage.getItem('nst_preferred_voice_uri');
    const voices = await getAvailableVoices();
    if (uri) {
        return voices.find(v => v.voiceURI === uri);
    }
    // Default to first Indian voice if no preference
    const indian = await getIndianVoices();
    return indian.length > 0 ? indian[0] : voices[0];
};

export const isAudioEnabled = () => {
    return localStorage.getItem('nst_audio_guide_enabled') !== 'false'; // Default to TRUE
};

export const toggleAudio = (enabled: boolean) => {
    localStorage.setItem('nst_audio_guide_enabled', enabled ? 'true' : 'false');
};

export const stopSpeech = () => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
};

export const speakText = async (text: string, force: boolean = false) => {
    if (!('speechSynthesis' in window)) return;
    if (!force && !isAudioEnabled()) return;

    stopSpeech();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = await getPreferredVoice();
    
    if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
    }
    
    // Gemini-like pitch/rate adjustment (slightly slower, deeper for some, but standard is safer)
    utterance.rate = 1.0; 
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
};

// AUDIO GUIDE MANAGER
export const playAudioGuide = async (key: string, defaultText: string) => {
    if (!isAudioEnabled()) return;

    // 1. Check for Admin Override Script
    const scriptsStr = localStorage.getItem('nst_voice_scripts');
    let textToSpeak = defaultText;
    
    if (scriptsStr) {
        const scripts = JSON.parse(scriptsStr);
        if (scripts[key]) {
            textToSpeak = scripts[key];
        }
    }

    await speakText(textToSpeak, true); // Force because we already checked isAudioEnabled
};

// WELCOME MESSAGE
export const playWelcomeMessage = async (userName: string, isAdmin: boolean = false) => {
    if (!isAudioEnabled()) return;

    let message = "";
    if (isAdmin) {
        // Admin Welcome
         const scriptsStr = localStorage.getItem('nst_voice_scripts');
         if (scriptsStr) {
             const scripts = JSON.parse(scriptsStr);
             if (scripts['ADMIN_WELCOME']) {
                 message = scripts['ADMIN_WELCOME'];
             }
         }
         if (!message) message = `Welcome back, Admin ${userName}. System is ready.`;
    } else {
        // Student Welcome
         const scriptsStr = localStorage.getItem('nst_voice_scripts');
         if (scriptsStr) {
             const scripts = JSON.parse(scriptsStr);
             if (scripts['STUDENT_WELCOME']) {
                 message = scripts['STUDENT_WELCOME'];
             }
         }
         if (!message) message = `Welcome ${userName}. Ready to learn something new today?`;
    }

    // Replace {name} placeholder if exists
    message = message.replace('{name}', userName);
    
    await speakText(message, true);
};
