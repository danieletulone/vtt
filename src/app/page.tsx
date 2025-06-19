"use client";
import React, { useRef, useState, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { createClient } from "@deepgram/sdk";

// Icone Heroicons SVG inline
const IconTranscribe = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v3m0 0a3 3 0 01-3-3h6a3 3 0 01-3 3zm0-3V5a3 3 0 013-3h0a3 3 0 013 3v10a3 3 0 01-3 3z" /></svg>
);
const IconCopy = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><rect x="3" y="3" width="13" height="13" rx="2" /></svg>
);
const IconFullscreen = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4m12-4v4h-4" /></svg>
);
const IconMinimize = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M4 4h16" /></svg>
);
const IconClose = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
);
const IconVideo = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="7" width="15" height="10" rx="2" /><path d="M21 7v10l-4-3.5V10.5L21 7z" /></svg>
);

export default function Home() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState<string | null>("Caricamento ffmpeg in corso...");
  const [transcribing, setTranscribing] = useState(false);
  const [deepgramError, setDeepgramError] = useState<string | null>(null);
  const [diarizedTranscript, setDiarizedTranscript] = useState<Array<{speaker: number, text: string}>>([]);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(true);
  const [fullscreenTranscript, setFullscreenTranscript] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  // Carica ffmpeg automaticamente all'avvio
  useEffect(() => {
    const loadFfmpeg = async () => {
      setLoadingMsg("Caricamento ffmpeg in corso...");
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      ffmpegRef.current = ffmpeg;
      setFfmpegLoaded(true);
      setLoadingMsg(null);
    };
    loadFfmpeg();
  }, []);

  // Gestione upload video
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setTranscript(null);
      setDiarizedTranscript([]);
      setDeepgramError(null);
      setShowVideo(true);
    }
  };

  // Nuova trascrizione
  const resetAll = () => {
    setVideoFile(null);
    setVideoUrl(null);
    setTranscript(null);
    setDiarizedTranscript([]);
    setDeepgramError(null);
    setShowVideo(true);
    setFullscreenTranscript(false);
    setCopyFeedback(null);
  };

  // Avvia trascrizione: estrae audio e invia a Deepgram
  const startTranscription = async () => {
    if (!videoFile || !ffmpegRef.current) return;
    setTranscribing(true);
    setLoadingMsg("Estrazione audio dal video...");
    setTranscript(null);
    setDiarizedTranscript([]);
    setDeepgramError(null);
    setCopyFeedback(null);
    try {
      const ffmpeg = ffmpegRef.current;
      const ext = videoFile.name.split('.').pop() || 'mp4';
      const inputName = `input.${ext}`;
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      await ffmpeg.exec(["-i", inputName, "-vn", "-acodec", "mp3", "output.mp3"]);
      const data = await ffmpeg.readFile("output.mp3");
      const blob = new Blob([data], { type: "audio/mp3" });
      setLoadingMsg("Invio audio a Deepgram e trascrizione in corso...");
      const deepgram = createClient("proxy", {
        global: { fetch: { options: { proxy: { url: "https://deepgram-proxy.zeurone.it" } } } },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { result, error } = await deepgram.listen.prerecorded.transcribeFile(blob as any, {
        model: "nova-2",
        language: 'it',
        diarize: true,
        punctuate: true,
        utterances: true,
        multichannel: true,
      });
      if (error) throw new Error(error.message || "Errore sconosciuto da Deepgram");
      const words = result?.results?.channels?.[0]?.alternatives?.[0]?.words;
      if (words && Array.isArray(words)) {
        let lastSpeaker: number | null = null;
        let currentText = "";
        const diarized: Array<{speaker: number, text: string}> = [];
        words.forEach((word: { speaker?: number, punctuated_word?: string, word?: string }, idx: number) => {
          if (typeof word.speaker !== 'number') return;
          if (word.speaker !== lastSpeaker) {
            if (currentText && lastSpeaker !== null) {
              diarized.push({ speaker: lastSpeaker, text: currentText.trim() });
            }
            lastSpeaker = word.speaker;
            currentText = word.punctuated_word || word.word || "";
          } else {
            currentText += " " + (word.punctuated_word || word.word || "");
          }
          if (idx === words.length - 1 && currentText) {
            diarized.push({ speaker: lastSpeaker as number, text: currentText.trim() });
          }
        });
        setDiarizedTranscript(diarized);
      } else {
        const transcriptText = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "Nessuna trascrizione trovata.";
        setTranscript(transcriptText);
      }
    } catch (err: unknown) {
      setDeepgramError(err instanceof Error ? err.message : "Errore nella trascrizione audio");
    } finally {
      setTranscribing(false);
      setLoadingMsg(null);
    }
  };

  // Copia transcript in clipboard
  const handleCopy = () => {
    let text = "";
    if (diarizedTranscript.length > 0) {
      text = diarizedTranscript.map(seg => `Speaker ${seg.speaker}: ${seg.text}`).join("\n\n");
    } else if (transcript) {
      text = transcript;
    }
    if (text) {
      navigator.clipboard.writeText(text);
      setCopyFeedback("Copiato!");
      setTimeout(() => setCopyFeedback(null), 1500);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-900 p-4">
      <div className="w-full max-w-3xl flex flex-col items-center gap-8 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Trascrizione Video con Speaker</h1>
        <p className="text-base text-neutral-600 dark:text-neutral-300 mb-4 text-center max-w-2xl">Carica un video, avvia la trascrizione e ottieni il testo con riconoscimento automatico degli speaker. Tutto avviene localmente, la trascrizione è affidata a Deepgram.</p>
        {loadingMsg && (
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium text-base bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded shadow-sm">
            <Spinner /> {loadingMsg}
          </div>
        )}
        {!videoFile && (
          <div className="w-full flex flex-col items-center gap-4">
            <label className="block w-full max-w-xs cursor-pointer">
              <span className="block text-base font-semibold mb-2">Seleziona un file video</span>
              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                disabled={!ffmpegLoaded || !!loadingMsg || transcribing}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
              />
            </label>
          </div>
        )}
        {videoFile && (
          <div className="w-full flex flex-col items-center gap-6">
            {showVideo && (
              <div className="relative w-full flex flex-col items-center">
                <video
                  src={videoUrl!}
                  controls
                  className="w-full max-w-2xl rounded shadow mb-2"
                  style={{ height: 320, objectFit: "contain", background: "#222" }}
                />
                <button
                  className="absolute top-2 right-2 bg-neutral-800/80 text-white rounded px-3 py-1 text-xs font-semibold hover:bg-neutral-900 transition flex items-center gap-1"
                  onClick={() => setShowVideo(false)}
                  title="Nascondi video"
                >
                  <IconClose /> Nascondi video
                </button>
              </div>
            )}
            {!showVideo && (
              <button
                className="mb-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 rounded px-4 py-2 text-sm font-semibold hover:bg-neutral-300 dark:hover:bg-neutral-600 transition flex items-center gap-2"
                onClick={() => setShowVideo(true)}
              >
                <IconVideo /> Mostra video
              </button>
            )}
            <div className="flex flex-row gap-4 w-full justify-center">
              <button
                className="rounded bg-blue-600 text-white px-6 py-3 font-semibold text-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
                onClick={startTranscription}
                disabled={transcribing || !!loadingMsg}
              >
                {transcribing ? <span className="flex items-center gap-2"><Spinner /> Trascrizione in corso...</span> : <><IconTranscribe /> Avvia trascrizione</>}
              </button>
              <button
                className="rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800 px-6 py-3 font-semibold text-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 transition"
                onClick={resetAll}
                disabled={transcribing || !!loadingMsg}
              >
                Nuova trascrizione
              </button>
            </div>
            {deepgramError && <div className="text-red-600 text-base mt-2 font-semibold text-center">{deepgramError}</div>}
            {(diarizedTranscript.length > 0 || transcript) && (
              <div className={`w-full ${fullscreenTranscript ? "fixed inset-0 z-50 bg-white dark:bg-neutral-900 flex flex-col items-center justify-center p-0" : "max-w-3xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg p-8 mt-4 overflow-x-auto"}`} style={fullscreenTranscript ? {padding: "2rem", margin: 0} : {}}>
                <div className="w-full flex flex-row justify-between items-center mb-4 gap-2">
                  <strong className="text-lg text-neutral-800 dark:text-neutral-100">Risultato trascrizione</strong>
                  <div className="flex gap-2">
                    <button
                      className="rounded bg-blue-600 text-white px-4 py-2 font-semibold text-sm hover:bg-blue-700 transition flex items-center gap-1"
                      onClick={handleCopy}
                    >
                      <IconCopy /> Copia
                    </button>
                    {copyFeedback && <span className="text-green-600 font-semibold text-sm ml-2">{copyFeedback}</span>}
                    <button
                      className="rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 px-4 py-2 font-semibold text-sm hover:bg-neutral-300 dark:hover:bg-neutral-600 transition flex items-center gap-1"
                      onClick={() => setFullscreenTranscript(f => !f)}
                    >
                      {fullscreenTranscript ? <><IconMinimize /> Riduci</> : <><IconFullscreen /> A tutto schermo</>}
                    </button>
                  </div>
                </div>
                <div className={`overflow-y-auto ${fullscreenTranscript ? "w-full h-full max-h-none px-8" : "max-h-[60vh]"}`} style={fullscreenTranscript ? {height: "80vh"} : {}}>
                  {diarizedTranscript.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {diarizedTranscript.map((seg, i) => (
                        <div key={i} className="flex gap-4 items-baseline">
                          <span className="font-bold text-blue-700 dark:text-blue-300 min-w-[110px] text-base">Speaker {seg.speaker}</span>
                          <span className="text-neutral-900 dark:text-neutral-100 text-base leading-relaxed">{seg.text}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-neutral-900 dark:text-neutral-100 text-base leading-relaxed whitespace-pre-wrap">{transcript}</div>
                  )}
                </div>
                {fullscreenTranscript && (
                  <button
                    className="absolute top-4 right-4 bg-blue-600 text-white rounded px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition z-50 flex items-center gap-1"
                    onClick={() => setFullscreenTranscript(false)}
                  >
                    <IconClose /> Chiudi fullscreen
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-blue-700 dark:text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
    </svg>
  );
}
