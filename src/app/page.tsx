"use client";
import React, { useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { createClient } from "@deepgram/sdk";

export default function Home() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [deepgramLoading, setDeepgramLoading] = useState(false);
  const [deepgramError, setDeepgramError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  // Load ffmpeg.wasm
  const loadFfmpeg = async () => {
    setLoading(true);
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      if (messageRef.current) messageRef.current.innerHTML = message;
    });
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ffmpeg;
    setFfmpegLoaded(true);
    setLoading(false);
  };

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setAudioUrl(null);
      setTranscript(null);
      setAudioBlob(null);
    }
  };

  // Extract audio using ffmpeg
  const extractAudio = async () => {
    if (!videoFile || !ffmpegRef.current) return;
    setLoading(true);
    const ffmpeg = ffmpegRef.current;
    await ffmpeg.writeFile("input.mp4", await fetchFile(videoFile));
    await ffmpeg.exec(["-i", "input.mp4", "-vn", "-acodec", "mp3", "output.mp3"]);
    const data = await ffmpeg.readFile("output.mp3");
    const blob = new Blob([data], { type: "audio/mp3" });
    setAudioUrl(URL.createObjectURL(blob));
    setAudioBlob(blob);
    setLoading(false);
  };

  // Send audio to Deepgram
  const sendToDeepgram = async () => {
    if (!audioBlob) return;
    setDeepgramLoading(true);
    setDeepgramError(null);
    setTranscript(null);
    try {
      // Prompt for API key (for demo; replace with secure method in production)
      const apiKey = window.prompt("Enter your Deepgram API Key:");
      if (!apiKey) throw new Error("No API key provided");
      const deepgram = createClient(apiKey);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { result, error } = await deepgram.listen.prerecorded.transcribeFile(audioBlob as any, { model: "nova" });
      if (error) throw new Error(error.message || "Unknown Deepgram error");
      // Extract transcript text
      const transcriptText = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "No transcript found.";
      setTranscript(transcriptText);
    } catch (err: unknown) {
      setDeepgramError(err instanceof Error ? err.message : "Failed to transcribe audio");
    } finally {
      setDeepgramLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-8 bg-background text-foreground">
      <div className="flex flex-col gap-4 items-center w-full max-w-md">
        {!ffmpegLoaded ? (
          <button
            className="rounded bg-blue-600 text-white px-4 py-2 font-semibold hover:bg-blue-700 disabled:opacity-50"
            onClick={loadFfmpeg}
            disabled={loading}
          >
            {loading ? "Loading ffmpeg..." : "Load ffmpeg"}
          </button>
        ) : (
          <>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {videoUrl && (
              <video
                src={videoUrl}
                controls
                className="w-full max-h-64 rounded shadow"
              />
            )}
            {videoFile && (
              <button
                className="rounded bg-green-600 text-white px-4 py-2 font-semibold hover:bg-green-700 disabled:opacity-50"
                onClick={extractAudio}
                disabled={loading}
              >
                {loading ? "Extracting audio..." : "Extract Audio (MP3)"}
              </button>
            )}
            {audioUrl && (
              <>
                <audio controls src={audioUrl} className="w-full mt-2" />
                <button
                  className="rounded bg-purple-600 text-white px-4 py-2 font-semibold hover:bg-purple-700 disabled:opacity-50 mt-2"
                  onClick={sendToDeepgram}
                  disabled={deepgramLoading}
                >
                  {deepgramLoading ? "Transcribing..." : "Transcribe with Deepgram"}
                </button>
                {deepgramError && <div className="text-red-600 text-sm mt-2">{deepgramError}</div>}
                {transcript && (
                  <div className="bg-gray-100 dark:bg-gray-800 rounded p-4 mt-2 w-full text-sm whitespace-pre-wrap">
                    <strong>Transcript:</strong>
                    <div>{transcript}</div>
                  </div>
                )}
              </>
            )}
            <p ref={messageRef} className="text-xs text-gray-500 mt-2" />
          </>
        )}
      </div>
    </div>
  );
}
