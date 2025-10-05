import type { ImmersionKitExample, ImmersionKitSearchResponse } from './types';
import { GM_xmlhttpRequest } from '$';

export function fetchExamples(keyword: string): Promise<ImmersionKitExample[]> {
    return new Promise((resolve, reject) => {
        const url = `https://apiv2.immersionkit.com/search?q=${encodeURIComponent(keyword)}`;
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            onload: (res) => {
                try {
                    const data = JSON.parse(res.responseText) as ImmersionKitSearchResponse;
                    if (data && Array.isArray(data.examples) && data.examples.length > 0) {
                        resolve(data.examples);
                    } else {
                        reject(new Error('No examples returned from ImmersionKit API'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse ImmersionKit API response' + e));
                }
            },
            onerror: () => reject(new Error('Failed to request ImmersionKit API')),
        });
    });
}

export function buildMediaTargets(
    example: ImmersionKitExample,
    mediaType: 'picture' | 'audio',
): { directUrl: string; apiUrl: string; filename: string } {
    const prefix = 'https://us-southeast-1.linodeobjects.com/immersionkit/media';
    let category = '';
    if (example.id && typeof example.id === 'string') {
        const parts = example.id.split('_');
        if (parts.length > 0) category = parts[0];
    }
    function toTitleCaseWords(s: string) {
        return s
            .split(/\s+/)
            .filter(Boolean)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }
    let rawTitle = typeof example.title === 'string' ? example.title : '';
    rawTitle = rawTitle.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    const titleFolder = toTitleCaseWords(rawTitle);
    const encTitleFolder = encodeURIComponent(titleFolder);
    const filename = mediaType === 'picture' ? example.image || '' : example.sound || '';
    const encFilename = encodeURIComponent(filename);
    const directUrl = `${prefix}/${category}/${encTitleFolder}/media/${encFilename}`;
    const rawPath = `media/${category}/${titleFolder}/media/${filename}`;
    const apiUrl = `https://apiv2.immersionkit.com/download_media?path=${encodeURIComponent(rawPath)}`;
    return { directUrl, apiUrl, filename };
}


