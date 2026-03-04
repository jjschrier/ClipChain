import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { app, auth } from "../firebase/config";

const waitForUser = () =>
    new Promise<typeof auth.currentUser>((resolve, reject) => {
        const current = auth.currentUser;
        if (current) {
            resolve(current);
            return;
        }
        const unsub = auth.onAuthStateChanged(
            (user) => {
                if (!user) return;
                unsub();
                resolve(user);
            },
            (err) => {
                unsub();
                reject(err);
            }
        );
        setTimeout(() => {
            unsub();
            reject(new Error("Auth timed out"));
        }, 12000);
    });

const sanitizeFilename = (name: string) =>
    name.replace(/[^a-zA-Z0-9._-]/g, "_");

export async function uploadToStorage(
    file: File,
    folder: "videos" | "thumbnails" | "avatars" | "metadata",
    onProgress?: (pct: number) => void
): Promise<string> {
    const user = await waitForUser();
    if (!user) throw new Error("Missing auth user");

    const storage = getStorage(app);
    const safeName = sanitizeFilename(file.name || "upload");
    const objectPath = `${folder}/${user.uid}/${Date.now()}-${safeName}`;
    const storageRef = ref(storage, objectPath);

    return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file, {
            contentType: file.type || undefined,
        });

        task.on(
            "state_changed",
            (snapshot) => {
                if (onProgress && snapshot.totalBytes) {
                    const pct = Math.round(
                        (snapshot.bytesTransferred / snapshot.totalBytes) * 100
                    );
                    onProgress(pct);
                }
            },
            (err) => reject(err),
            async () => {
                try {
                    const url = await getDownloadURL(task.snapshot.ref);
                    resolve(url);
                } catch (err) {
                    reject(err);
                }
            }
        );
    });
}
