import { useInfiniteQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/axios";
import type { Message } from "@/types";

const PAGE_LIMIT = 30;

export const useMessages = (chatId: string) => {
  const { apiWithAuth } = useApi();

  return useInfiniteQuery({
    queryKey: ["messages", chatId],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<Message[]> => {
      const params: Record<string, string> = { limit: String(PAGE_LIMIT) };
      if (pageParam) params.before = pageParam;

      const { data } = await apiWithAuth<Message[]>({
        method: "GET",
        url: `/messages/chat/${chatId}`,
        params,
      });
      return data;
    },
    getNextPageParam: (firstPage) =>
      // If we got a full page, there are more; use the oldest message's createdAt as cursor
      firstPage.length === PAGE_LIMIT ? firstPage[0]?.createdAt : undefined,
    select: (data) => ({
      // Flatten pages into a single chronological array (oldest first)
      pages: data.pages,
      pageParams: data.pageParams,
      messages: data.pages.flat(),
    }),
    enabled: !!chatId,
  });
};