export type SponsorSegment = {
  UUID: string;
  startTime: number;
  endTime: number;
  category: string;
};

const SB_BASE = "https://sponsor.ajay.app";

export class SponsorBlockService {
  static async getSkipSegments(
    videoId: string,
    categories: string[] = ["sponsor"]
  ): Promise<SponsorSegment[]> {
    const url = new URL(`${SB_BASE}/api/skipSegments`);
    url.searchParams.set("videoID", videoId);
    url.searchParams.set("service", "YouTube");
    url.searchParams.set("categories", JSON.stringify(categories));

    const res = await fetch(url.toString());

    if (res.status === 404) return [];

    if (!res.ok) {
      throw new Error(`SponsorBlock API error: ${res.status}`);
    }

    const data: any[] = await res.json();

    return data.map((item) => ({
      UUID: item.UUID,
      startTime: item.segment[0],
      endTime: item.segment[1],
      category: item.category,
    }));
  }
}
