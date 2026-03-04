import { uploadToStorage } from "./uploadToStorage";

export type TokenMetadataInput = {
    name: string;
    symbol: string;
    description?: string;
    imageUrl?: string | null;
    creatorAddress?: string;
};

type TokenMetadata = {
    name: string;
    symbol: string;
    description: string;
    image?: string;
    external_url?: string;
    attributes?: Array<{ trait_type: string; value: string }>;
    properties?: {
        category?: string;
        files?: Array<{ uri: string; type: string }>;
    };
};

export const buildTokenMetadata = (input: TokenMetadataInput): TokenMetadata => {
    const description =
        input.description?.trim() ||
        `Official ${input.name} fan token on ClipChain.`;
    const metadata: TokenMetadata = {
        name: input.name,
        symbol: input.symbol,
        description,
        external_url: typeof window !== "undefined" ? window.location.origin : undefined,
        attributes: [
            { trait_type: "Platform", value: "ClipChain" },
            ...(input.creatorAddress ? [{ trait_type: "Creator", value: input.creatorAddress }] : []),
        ],
    };

    const imageUrl = input.imageUrl?.trim();
    if (imageUrl) {
        metadata.image = imageUrl;
        metadata.properties = {
            category: "image",
            files: [{ uri: imageUrl, type: "image/png" }],
        };
    }

    return metadata;
};

export const uploadTokenMetadata = async (input: TokenMetadataInput): Promise<string> => {
    const metadata = buildTokenMetadata(input);
    const json = JSON.stringify(metadata, null, 2);
    const filename = `${input.symbol.toLowerCase()}-metadata.json`;
    const file = new File([json], filename, { type: "application/json" });
    return uploadToStorage(file, "metadata");
};
