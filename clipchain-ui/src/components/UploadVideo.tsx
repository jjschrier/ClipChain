import React, { useState } from "react";
import { db } from "../firebase/config";
import { collection, addDoc, serverTimestamp, setDoc, doc, getDoc } from "firebase/firestore";
import { useWallet } from "@solana/wallet-adapter-react";
import { uploadToStorage } from "../lib/uploadToStorage";
import { getAvatar } from "../lib/userService";


const UploadVideo = ({ onUpload }: { onUpload?: (video: any) => void }) => {
    const [title, setTitle] = useState("");
    const [videoUrl, setVideoUrl] = useState("");
    const [thumbnailUrl, setThumbnailUrl] = useState("");
    const [saving, setSaving] = useState(false);
    const [thumbProgress, setThumbProgress] = useState(0);
    const [videoProgress, setVideoProgress] = useState(0);
    const { publicKey } = useWallet();

    // Must have a connected wallet, title, video, and thumbnail to save
    const canSave = Boolean(title.trim() && videoUrl && thumbnailUrl && publicKey);

    const handleSave = async () => {
        if (!publicKey) {
            alert("Please connect your wallet before saving!");
            return;
        }
        if (!canSave) {
            alert("Please add a title, video, and thumbnail.");
            return;
        }

        setSaving(true);
        try {
            const creatorKey = publicKey.toBase58();
            const avatarUrl = await getAvatar().catch(() => null);
            const creatorDocSnap = await getDoc(doc(db, "creators", creatorKey)).catch(() => null);
            const creatorData = creatorDocSnap?.data() as any;
            const creatorDisplayName = creatorData?.displayName || "";
            const creatorMint = creatorData?.tokenMint || "";

            const docRef = await addDoc(collection(db, "videos"), {
                title: title.trim(),
                videoUrl,
                thumbnailUrl,
                tokenMint: creatorMint,
                // ✅ CRITICAL FIX: Save the connected user's Solana Public Key
                creator: creatorKey,
                creatorDisplayName,
                creatorAvatar: avatarUrl || "",
                createdAt: serverTimestamp(),
            });

            // Upsert creator profile with display name
            const creatorDoc = doc(db, "creators", creatorKey);
            await setDoc(
                creatorDoc,
                {
                    wallet: creatorKey,
                    displayName: creatorDisplayName,
                    avatarUrl: avatarUrl || "",
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            onUpload?.({
                id: docRef.id,
                title,
                displayName: creatorDisplayName,
                videoUrl,
                thumbnailUrl,
                tokenMint: "",
                creator: creatorKey,
            });

            setTitle("");
            setVideoUrl("");
            setThumbnailUrl("");
            alert("✅ Video published!");

        } catch (e: any) {
            console.error("Error saving video:", e);
            alert(e?.message || "Failed to save. Check Firestore rules & network.");
        } finally {
            setSaving(false);
        }
    };


    const handleFileSelect = async (file: File, kind: "thumbnail" | "video") => {
        try {
            const setProgress = kind === "thumbnail" ? setThumbProgress : setVideoProgress;
            setProgress(0);
            const folder = kind === "thumbnail" ? "thumbnails" : "videos";
            const url = await uploadToStorage(file, folder, (pct) => setProgress(pct));
            setProgress(100);
            if (kind === "thumbnail") setThumbnailUrl(url);
            else setVideoUrl(url);
        } catch (err: any) {
            const setProgress = kind === "thumbnail" ? setThumbProgress : setVideoProgress;
            setProgress(0);
            console.error("Upload error", err);
            alert(err?.message || "Upload failed");
        }
    };

    return (
        <div className="p-4 space-y-4">
            <input
                type="text"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-800/40 border border-gray-700 rounded-md p-2 text-white outline-none"
            />
            {/* Upload Thumbnail */}
            <div>
                <p className="text-white mb-2">Upload Thumbnail</p>
                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file, "thumbnail");
                    }}
                    className="text-white"
                />
                {thumbnailUrl && (
                    <img
                        src={thumbnailUrl}
                        alt="thumbnail preview"
                        className="mt-3 h-24 rounded-md object-cover border border-gray-700"
                    />
                )}
                {thumbProgress > 0 && (
                    <div className="mt-2 h-2 w-full bg-gray-800 rounded">
                        <div
                            className="h-2 bg-purple-500 rounded"
                            style={{ width: `${thumbProgress}%` }}
                        />
                    </div>
                )}
            </div>

            {/* Upload Video */}
            <div>
                <p className="text-white mb-2">Upload Video</p>
                <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file, "video");
                    }}
                    className="text-white"
                />
                {videoUrl && (
                    <video
                        className="mt-3 w-full max-w-md rounded-md border border-gray-700"
                        controls
                        src={videoUrl}
                    />
                )}
                {videoProgress > 0 && (
                    <div className="mt-2 h-2 w-full bg-gray-800 rounded">
                        <div
                            className="h-2 bg-purple-500 rounded"
                            style={{ width: `${videoProgress}%` }}
                        />
                    </div>
                )}
            </div>

            {!canSave && (
                <div className="text-sm text-amber-300 bg-amber-900/30 border border-amber-700 rounded p-3">
                    <p className="font-semibold mb-1">You still need:</p>
                    <ul className="list-disc list-inside space-y-1">
                        {!publicKey && <li>Connect your wallet</li>}
                        {!title.trim() && <li>Enter a title</li>}
                        {!thumbnailUrl && <li>Upload a thumbnail</li>}
                        {!videoUrl && <li>Upload a video</li>}
                    </ul>
                </div>
            )}

            <button
                onClick={handleSave}
                disabled={saving || !canSave}
                className={`px-4 py-2 rounded-md font-medium ${saving || !canSave
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700"
                    } text-white`}
            >
                {saving ? "Publishing..." : "Publish Video"}
            </button>
        </div>
    );
};

export default UploadVideo;
