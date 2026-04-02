/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Float, PerspectiveCamera } from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, MicOff, Settings, Volume2, VolumeX, 
  MapPin, Sun, Clock, User, RefreshCw, 
  Send, Menu, X, Globe
} from 'lucide-react';
import Markdown from 'react-markdown';

// --- Types ---
type VoiceMode = 'male' | 'female';
type Theme = 'dark' | 'light';

interface UserPreferences {
  name: string;
  voiceMode: VoiceMode;
  voiceEnabled: boolean;
  theme: Theme;
  hasLaunched: boolean;
}

// --- 3D Avatar Component ---
const ZeroxAvatar = ({ isSpeaking, isListening }: { isSpeaking: boolean, isListening: boolean }) => {
  const meshRef = useRef<any>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.getElapsedTime();
      meshRef.current.rotation.x = Math.sin(time / 2) / 4;
      meshRef.current.rotation.y = Math.cos(time / 3) / 4;
      
      // React to speaking/listening
      if (isSpeaking) {
        meshRef.current.distort = 0.4 + Math.sin(time * 10) * 0.2;
        meshRef.current.speed = 5;
      } else if (isListening) {
        meshRef.current.distort = 0.3 + Math.sin(time * 5) * 0.1;
        meshRef.current.speed = 2;
      } else {
        meshRef.current.distort = 0.2;
        meshRef.current.speed = 1;
      }
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <Sphere args={[1, 64, 64]} ref={meshRef}>
        <MeshDistortMaterial
          color={isSpeaking ? "#00f2ff" : isListening ? "#ff00ea" : "#4f46e5"}
          envMapIntensity={0.4}
          clearcoat={0.8}
          clearcoatRoughness={0}
          metalness={0.1}
          distort={0.2}
          speed={1}
        />
      </Sphere>
    </Float>
  );
};

// --- Error Boundary ---
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, errorInfo: any) { console.error("App Error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <h1 className="text-2xl font-bold text-red-500">System Failure</h1>
            <p className="opacity-60">Zerox encountered a critical error. This usually happens due to corrupted local data or browser restrictions.</p>
            <button 
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="px-6 py-3 bg-indigo-600 rounded-xl font-medium hover:bg-indigo-500 transition-all"
            >
              Reset System Data
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main App Component ---
export default function App() {
  // State
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    try {
      const saved = localStorage.getItem('zerox_prefs');
      return saved ? JSON.parse(saved) : {
        name: '',
        voiceMode: 'female',
        voiceEnabled: true,
        theme: 'dark',
        hasLaunched: false
      };
    } catch (e) {
      return {
        name: '',
        voiceMode: 'female',
        voiceEnabled: true,
        theme: 'dark',
        hasLaunched: false
      };
    }
  });

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>(() => {
    try {
      const saved = localStorage.getItem('zerox_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [weather, setWeather] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isMicSupported, setIsMicSupported] = useState(false);

  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<any>(null);
  const aiRef = useRef<any>(null);
  const chatRef = useRef<any>(null);

  // Feature Support Check
  useEffect(() => {
    setIsSpeechSupported('speechSynthesis' in window);
    setIsMicSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }, []);

  // Initialize AI
  useEffect(() => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing. AI features will not work.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    aiRef.current = ai;
    
    // Map history for Gemini SDK
    const history = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    chatRef.current = ai.chats.create({
      model: "gemini-3-flash-preview",
      history: history,
      config: {
        systemInstruction: `You are ZEROX, a futuristic, intelligent, and loyal personal AI assistant. 
        You address the user as "Boss". Your tone is professional yet friendly, similar to Jarvis from Iron Man.
        If the user asks "who are you?", you MUST respond that you were developed by Nayan.
        Keep responses concise but helpful. You have access to the user's name: ${prefs.name}.
        Current Time: ${currentTime}. 
        User Location: ${address || location || 'Unknown'}. 
        Current Weather: ${weather || 'Unknown'}.
        If the user asks for weather or local info, use this data. You can also suggest nearby activities based on the weather.`
      }
    });
  }, [prefs.name, location, weather, address, currentTime]);

  // Update Time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [isContinuous, setIsContinuous] = useState(false);

  // Startup Sound
  const playStartupSound = () => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.5);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
  };

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = isContinuous;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('')
          .toLowerCase();

        if (isContinuous && !isListening) {
          if (transcript.includes('hey zerox') || transcript.includes('hey xerox')) {
            speak("Yes, Boss? I'm listening.");
            setIsListening(true);
            // Restart for actual command
            recognitionRef.current.stop();
            setTimeout(() => {
              recognitionRef.current.continuous = false;
              recognitionRef.current.start();
            }, 500);
          }
        } else if (!isContinuous || isListening) {
          if (event.results[0].isFinal) {
            handleUserInput(transcript);
            setIsListening(false);
            if (isContinuous) {
              // Go back to wake-word mode
              setTimeout(() => {
                recognitionRef.current.continuous = true;
                recognitionRef.current.start();
              }, 1000);
            }
          }
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
        if (isContinuous && event.error !== 'not-allowed') {
          setTimeout(() => {
            try {
              recognitionRef.current?.start();
            } catch (e) {
              console.error("Failed to restart recognition:", e);
            }
          }, 1000);
        }
      };

      recognitionRef.current.onend = () => {
        if (isContinuous && !isSpeaking) {
          try {
            recognitionRef.current?.start();
          } catch (e) {
            console.error("Failed to restart recognition on end:", e);
          }
        } else {
          setIsListening(false);
        }
      };
    }
  }, [isContinuous, isSpeaking]);

  // Welcome Flow
  useEffect(() => {
    if (!prefs.hasLaunched) {
      const welcome = async () => {
        await new Promise(r => setTimeout(r, 1000));
        playStartupSound();
        speak("Zerox activated, your personal AI assistant. What should I call you, Boss?");
        setMessages([{ role: 'assistant', content: "Zerox activated. What should I call you, Boss?" }]);
      };
      welcome();
    } else if (messages.length === 0) {
      playStartupSound();
      const greet = `Welcome back, Boss ${prefs.name}. How can I assist you today?`;
      setMessages([{ role: 'assistant', content: greet }]);
      speak(greet);
    }
  }, [prefs.hasLaunched]);

  // Save Preferences & History
  useEffect(() => {
    localStorage.setItem('zerox_prefs', JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    localStorage.setItem('zerox_history', JSON.stringify(messages));
  }, [messages]);

  // Handle Location
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      console.error("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      
      try {
        // Fetch Weather from Open-Meteo (Free, no key)
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
        if (!weatherRes.ok) throw new Error("Weather fetch failed");
        const weatherData = await weatherRes.json();
        if (weatherData.current_weather) {
          const temp = weatherData.current_weather.temperature;
          const code = weatherData.current_weather.weathercode;
          // Simple mapping for weather codes
          const weatherDesc = code === 0 ? "Clear Sky" : code < 4 ? "Partly Cloudy" : "Cloudy";
          setWeather(`${weatherDesc}, ${temp}°C`);
        }

        // Fetch Address from Nominatim (OSM)
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`, {
          headers: { 'Accept-Language': 'en' }
        });
        if (!geoRes.ok) throw new Error("Geocoding fetch failed");
        const geoData = await geoRes.json();
        if (geoData.display_name) {
          const city = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.state || "Unknown Location";
          setAddress(city);
        }
      } catch (err) {
        console.error("Failed to fetch location details:", err);
      }
    }, (error) => {
      let errorMsg = "Location access denied.";
      if (error.code === error.TIMEOUT) errorMsg = "Location request timed out.";
      if (error.code === error.POSITION_UNAVAILABLE) errorMsg = "Location info unavailable.";
      console.error("Location error:", errorMsg);
      setAddress(errorMsg);
    }, { timeout: 10000, enableHighAccuracy: false });
  }, []);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Load Voices
  useEffect(() => {
    if (!window.speechSynthesis) {
      console.warn("Speech Synthesis not supported in this browser.");
      setIsSpeechSupported(false);
      return;
    }
    
    const loadVoices = () => {
      try {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        setIsSpeechSupported(availableVoices.length > 0);
      } catch (e) {
        console.error("Failed to load voices:", e);
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Speak Function
  const speak = (text: string) => {
    if (!prefs.voiceEnabled || !window.speechSynthesis) return;
    
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Improved voice selection
      // Prioritize high-quality/premium voices
      const maleVoiceNames = [
        'google uk english male', 
        'google us english male',
        'microsoft david', 
        'alex', 
        'daniel', 
        'guy', 
        'james', 
        'thomas', 
        'male'
      ];
      const femaleVoiceNames = [
        'google uk english female', 
        'google us english female',
        'samantha', 
        'zira', 
        'victoria', 
        'siri', 
        'female'
      ];

      let selectedVoice = null;
      const availableVoices = voices.length > 0 ? voices : window.speechSynthesis.getVoices();

      if (prefs.voiceMode === 'female') {
        // Try to find the best match in order of priority
        for (const name of femaleVoiceNames) {
          selectedVoice = availableVoices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes(name));
          if (selectedVoice) break;
        }
      } else {
        // Try to find the best match in order of priority
        for (const name of maleVoiceNames) {
          selectedVoice = availableVoices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes(name));
          if (selectedVoice) break;
        }
      }

      // Fallback if no specific voice found
      if (!selectedVoice) {
        selectedVoice = availableVoices.find(v => v.lang.startsWith('en'));
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      
      // Fine-tune pitch and rate for a "premium" feel
      if (prefs.voiceMode === 'female') {
        utterance.pitch = 1.05;
        utterance.rate = 1.05;
      } else {
        // Deeper, slightly slower for a more "attractive/Jarvis" male voice
        utterance.pitch = 0.88; 
        utterance.rate = 0.95;
      }
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Speech Synthesis failed:", e);
      setIsSpeaking(false);
    }
  };

  // Handle User Input
  const handleUserInput = async (text: string) => {
    if (!text.trim()) return;
    
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');

    if (!chatRef.current) {
      const errorMsg = "I apologize, Boss, but my AI core is not initialized. Please check your configuration.";
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
      speak(errorMsg);
      return;
    }

    try {
      const response = await chatRef.current.sendMessage({ message: text });
      const aiText = response.text;
      setMessages(prev => [...prev, { role: 'assistant', content: aiText }]);
      speak(aiText);
    } catch (error) {
      console.error("AI Error:", error);
      const errorMsg = "I apologize, Boss, but I'm having trouble connecting to my core systems.";
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
      speak(errorMsg);
    }
  };

  const handleInitialName = (name: string) => {
    setPrefs(prev => ({ ...prev, name, hasLaunched: true }));
    const response = `Nice to meet you, Boss ${name}. I am always at your service.`;
    setMessages(prev => [...prev, { role: 'user', content: name }, { role: 'assistant', content: response }]);
    speak(response);
    requestLocation();
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      window.speechSynthesis.cancel();
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${prefs.theme === 'dark' ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'} font-sans overflow-hidden flex flex-col`}>
      
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
        
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] select-none">
          <h2 className="text-[15vw] font-black tracking-[0.2em] uppercase rotate-[-15deg] whitespace-nowrap">
            Nayan Creation
          </h2>
        </div>
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 flex justify-between items-center backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Globe className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tighter uppercase">Zerox</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 font-mono">Personal AI System</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 text-xs font-mono opacity-60">
            <div className="flex items-center gap-2">
              <Clock size={14} /> {currentTime}
            </div>
            <button 
              onClick={requestLocation}
              className="flex items-center gap-2 hover:text-indigo-400 transition-colors group"
            >
              <MapPin size={14} className="group-hover:animate-bounce" /> {address || location || "Locating..."}
            </button>
            {weather && (
              <div className="flex items-center gap-2">
                <Sun size={14} /> {weather}
              </div>
            )}
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        
        {/* 3D Avatar Section */}
        <div className="w-full md:w-1/2 h-[40vh] md:h-full relative">
          <Canvas>
            <PerspectiveCamera makeDefault position={[0, 0, 5]} />
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} />
            <ZeroxAvatar isSpeaking={isSpeaking} isListening={isListening} />
          </Canvas>
          
          {/* Status Indicators */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
            <AnimatePresence mode="wait">
              {isSpeaking && (
                <div className="flex flex-col items-center gap-2">
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="px-4 py-2 rounded-full bg-cyan-500/20 border border-cyan-500/50 backdrop-blur-md text-cyan-400 text-xs font-mono uppercase tracking-widest"
                  >
                    Zerox is speaking...
                  </motion.div>
                  <button 
                    onClick={() => {
                      window.speechSynthesis.cancel();
                      setIsSpeaking(false);
                    }}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all"
                    title="Stop Speaking"
                  >
                    <VolumeX size={16} />
                  </button>
                </div>
              )}
              {isListening && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="px-4 py-2 rounded-full bg-pink-500/20 border border-pink-500/50 backdrop-blur-md text-pink-400 text-xs font-mono uppercase tracking-widest"
                >
                  Listening...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Chat Section */}
        <div className="w-full md:w-1/2 flex flex-col p-4 md:p-8 relative z-10">
          <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
            {messages.map((msg, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] p-4 rounded-2xl ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                    : 'bg-white/5 backdrop-blur-xl border border-white/10 rounded-tl-none'
                }`}>
                  <div className="text-xs opacity-50 mb-1 font-mono uppercase">
                    {msg.role === 'user' ? (prefs.name || 'Boss') : 'Zerox'}
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Input Area */}
          <div className="mt-6 flex gap-3">
            <div className="flex-1 relative">
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleUserInput(input)}
                placeholder={!prefs.hasLaunched ? "Enter your name..." : "Ask Zerox anything..."}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 focus:outline-none focus:border-indigo-500/50 transition-all backdrop-blur-xl"
              />
              <button 
                onClick={() => !prefs.hasLaunched ? handleInitialName(input) : handleUserInput(input)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
            <button 
              onClick={toggleListening}
              disabled={!isMicSupported}
              className={`p-4 rounded-2xl transition-all ${
                !isMicSupported 
                  ? 'opacity-20 cursor-not-allowed bg-white/5' 
                  : isListening 
                    ? 'bg-pink-600 shadow-lg shadow-pink-500/20' 
                    : 'bg-white/5 border border-white/10 hover:bg-white/10'
              }`}
            >
              {isListening ? <Mic size={24} /> : <MicOff size={24} />}
            </button>
          </div>
        </div>
      </main>

      {/* Settings Panel */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-[#111] border border-white/10 rounded-3xl p-8 relative"
            >
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                <Settings className="text-indigo-500" /> System Settings
              </h2>

              <div className="space-y-8">
                {/* Voice Mode */}
                <div className="space-y-3">
                  <label className="text-xs font-mono uppercase opacity-50">Voice Personality</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setPrefs(p => ({ ...p, voiceMode: 'male' }));
                        // Immediate feedback
                        setTimeout(() => speak("Male voice personality selected, Boss."), 100);
                      }}
                      className={`flex-1 py-3 rounded-xl border transition-all ${prefs.voiceMode === 'male' ? 'bg-indigo-600 border-indigo-500' : 'bg-white/5 border-white/10 opacity-50'}`}
                    >
                      Male
                    </button>
                    <button 
                      onClick={() => {
                        setPrefs(p => ({ ...p, voiceMode: 'female' }));
                        // Immediate feedback
                        setTimeout(() => speak("Female voice personality selected, Boss."), 100);
                      }}
                      className={`flex-1 py-3 rounded-xl border transition-all ${prefs.voiceMode === 'female' ? 'bg-indigo-600 border-indigo-500' : 'bg-white/5 border-white/10 opacity-50'}`}
                    >
                      Female
                    </button>
                  </div>
                </div>

                {/* Voice Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Voice Feedback</h3>
                    <p className="text-xs opacity-50">Enable Zerox to speak responses</p>
                  </div>
                  <button 
                    onClick={() => setPrefs(p => ({ ...p, voiceEnabled: !p.voiceEnabled }))}
                    className={`p-3 rounded-xl transition-all ${prefs.voiceEnabled ? 'bg-indigo-600' : 'bg-white/5'}`}
                  >
                    {prefs.voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                  </button>
                </div>

                {/* Continuous Listening */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Wake Word Detection</h3>
                    <p className="text-xs opacity-50">Listen for "Hey Zerox"</p>
                  </div>
                  <button 
                    onClick={() => {
                      setIsContinuous(!isContinuous);
                      if (!isContinuous) {
                        recognitionRef.current?.start();
                      } else {
                        recognitionRef.current?.stop();
                      }
                    }}
                    className={`p-3 rounded-xl transition-all ${isContinuous ? 'bg-indigo-600' : 'bg-white/5'}`}
                  >
                    <Mic size={20} />
                  </button>
                </div>

                {/* Theme Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Interface Theme</h3>
                    <p className="text-xs opacity-50">Switch between light and dark</p>
                  </div>
                  <button 
                    onClick={() => setPrefs(p => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))}
                    className="p-3 bg-white/5 rounded-xl border border-white/10"
                  >
                    {prefs.theme === 'dark' ? 'Dark' : 'Light'}
                  </button>
                </div>

                {/* Location Refresh */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Location Awareness</h3>
                    <p className="text-xs opacity-50">Refresh weather & local data</p>
                  </div>
                  <button 
                    onClick={requestLocation}
                    className="p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-indigo-600 transition-all"
                  >
                    <MapPin size={20} />
                  </button>
                </div>

                {/* Browser Compatibility */}
                <div className="space-y-3">
                  <label className="text-xs font-mono uppercase opacity-50">System Compatibility</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${isSpeechSupported ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                      <Volume2 size={14} /> Voice Output
                    </div>
                    <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${isMicSupported ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                      <Mic size={14} /> Voice Input
                    </div>
                  </div>
                </div>

                {/* Clear Chat */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Chat History</h3>
                    <p className="text-xs opacity-50">Clear all previous messages</p>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm("Clear all chat history?")) {
                        setMessages([]);
                        localStorage.removeItem('zerox_history');
                      }
                    }}
                    className="p-3 bg-red-500/10 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/20 transition-all"
                  >
                    <RefreshCw size={20} />
                  </button>
                </div>

                {/* Reset */}
                <button 
                  onClick={() => {
                    if (confirm("Are you sure you want to reset Zerox? All memory will be lost.")) {
                      localStorage.removeItem('zerox_prefs');
                      window.location.reload();
                    }
                  }}
                  className="w-full py-4 rounded-2xl border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 font-medium"
                >
                  <RefreshCw size={18} /> Reset System Memory
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}
