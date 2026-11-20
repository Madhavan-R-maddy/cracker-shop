import React, { useState } from 'react';
import { updateProduct, uploadDemoVideo } from '../lib/supabase';

export default function VideoModal({ cracker, isOpen, onClose, onUpdated }) {
  const [videoUrl, setVideoUrl] = useState(cracker?.video_url || '');
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!isOpen || !cracker) return null;

  // Convert YouTube links to embed format
  function getEmbedUrl(url) {
    if (!url) return null;
    try {
      if (url.includes('youtube.com/watch')) {
        const v = new URL(url).searchParams.get('v');
        return v ? `https://www.youtube.com/embed/${v}` : url;
      }
      if (url.includes('youtu.be/')) {
        const v = url.split('youtu.be/')[1]?.split('?')[0];
        return v ? `https://www.youtube.com/embed/${v}` : url;
      }
    } catch {
      return url;
    }
    return url;
  }

  const embedUrl = getEmbedUrl(videoUrl);
  const isDirectVideo = embedUrl && (
    embedUrl.endsWith('.mp4') || 
    embedUrl.endsWith('.webm') || 
    embedUrl.includes('cracker-videos') || 
    embedUrl.startsWith('blob:')
  );

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const publicUrl = await uploadDemoVideo(file);
      setVideoUrl(publicUrl);
      await updateProduct(cracker.id, { video_url: publicUrl });
      if (onUpdated) onUpdated();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveUrl(e) {
    e.preventDefault();
    try {
      await updateProduct(cracker.id, { video_url: videoUrl });
      setIsEditing(false);
      if (onUpdated) onUpdated();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-light-surface-container-lowest border-2 border-gold-border rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-light-primary-container px-5 py-3 border-b border-gold-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-deep-green text-[22px]">play_circle</span>
            <h3 className="font-headline text-base font-bold text-deep-green">{cracker.name} — Demo Video</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Video Player Area */}
        <div className="p-4 flex flex-col gap-3">
          {videoUrl ? (
            <div className="w-full h-72 bg-black rounded-md overflow-hidden flex items-center justify-center">
              {isDirectVideo ? (
                <video src={embedUrl} controls className="w-full h-full object-contain" autoPlay />
              ) : (
                <iframe
                  src={embedUrl}
                  title="Demo Video"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
          ) : (
            <div className="w-full h-64 rounded-md bg-deep-green/10 border-2 border-dashed border-gold-border flex flex-col items-center justify-center gap-2 text-center p-4">
              <span className="material-symbols-outlined text-gold text-[48px]">videocam_off</span>
              <p className="font-title text-sm font-semibold text-deep-green">No demo video configured yet</p>
              <p className="font-body text-xs text-light-on-surface-variant max-w-xs">
                Upload a short MP4 demo clip or paste a YouTube / online video link to show customers how it bursts.
              </p>
            </div>
          )}

          {/* Manage / Upload Video Section */}
          <div className="border-t border-light-outline-variant pt-3 flex flex-col gap-2">
            {!isEditing ? (
              <div className="flex items-center justify-between">
                <span className="font-body text-xs text-light-on-surface-variant truncate max-w-sm">
                  {videoUrl || 'No video link attached'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 rounded bg-gold-soft border border-gold-border font-label text-xs font-bold text-deep-green hover:bg-gold hover:text-on-gold"
                >
                  Change / Upload Video
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveUrl} className="flex flex-col gap-2 bg-light-surface-container-low p-3 rounded-md border border-light-outline-variant">
                <label className="flex flex-col gap-1">
                  <span className="font-label text-xs font-semibold text-light-on-surface">Paste Video Link (YouTube or Web URL):</span>
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="min-h-10 px-3 py-1.5 rounded border border-gold-border bg-white text-xs"
                  />
                </label>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-deep-green text-white hover:opacity-90 font-label font-bold">
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    <span>{uploading ? 'Uploading...' : 'Upload Video File'}</span>
                    <input type="file" accept="video/*" onChange={handleFileUpload} disabled={uploading} className="hidden" />
                  </label>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 rounded border border-light-outline-variant bg-white font-label font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded bg-gold text-on-gold font-label font-bold border border-gold-border"
                    >
                      Save Link
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
