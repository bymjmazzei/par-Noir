/**
 * Me-page state, memos, and effects: tabs, saved, connections, engagement, find-file.
 * Keeps Me-page logic in one place.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import type { IndexedFile } from '../types/aggregator';
import { getCreatorIdentifier, normalizeId, isThought, isCollection, isMedia } from '../utils/contentClass';
import { getSavedFeed } from '../services/savedFeedService';
import { getMetadataIndexService } from '../services/metadata/MetadataIndexService';
import { API_ENDPOINT } from '../config/api';

const EMPTY_ARRAY: IndexedFile[] = [];

export type MePageTab = 'all' | 'media' | 'thoughts' | 'collections' | 'likes' | 'comments' | 'shares' | 'saved' | 'connections';

export interface ConnectionRow {
  connectionId: string;
  userPnIdentifier: string;
  status: string;
  createdAt: string;
  acceptedAt?: string;
}

export interface UseMePageDataParams {
  viewingCreatorId: string | null;
  /** True when Me/Index tab is showing the user's profile */
  mePageActive?: boolean;
  userState: {
    isUnlocked: boolean;
    pnIdentifier?: string;
    preferences: { displayName?: string; mePageSortOrder?: string };
  };
  mediaFiles: IndexedFile[];
  thoughtsFiles: IndexedFile[];
  collectionsFiles: IndexedFile[];
  indexedFiles: IndexedFile[];
  visibleFileId: string | null;
  currentFeedIndex: number;
  setCurrentFeedIndex: (n: number | ((prev: number) => number)) => void;
  setVisibleFileId: (id: string | null) => void;
}

export function useMePageData({
  viewingCreatorId,
  mePageActive = false,
  userState,
  mediaFiles,
  thoughtsFiles,
  collectionsFiles,
  indexedFiles,
  visibleFileId,
  currentFeedIndex,
  setCurrentFeedIndex,
  setVisibleFileId,
}: UseMePageDataParams) {
  // --- state ---
  const [userLikedFiles, setUserLikedFiles] = useState<IndexedFile[]>([]);
  const [userCommentedFiles, setUserCommentedFiles] = useState<IndexedFile[]>([]);
  const [userSharedFiles, setUserSharedFiles] = useState<IndexedFile[]>([]);
  const [userLikedFileIds, setUserLikedFileIds] = useState<string[]>([]);
  const [userCommentedFileIds, setUserCommentedFileIds] = useState<string[]>([]);
  const [userSharedFileIds, setUserSharedFileIds] = useState<string[]>([]);
  const [viewedUserLikedFiles, setViewedUserLikedFiles] = useState<IndexedFile[]>([]);
  const [viewedUserCommentedFiles, setViewedUserCommentedFiles] = useState<IndexedFile[]>([]);
  const [connectionTopPosts, setConnectionTopPosts] = useState<IndexedFile[]>([]);
  const [connectionsList, setConnectionsList] = useState<ConnectionRow[]>([]);
  const [savedFeedFileIds, setSavedFeedFileIds] = useState<string[]>([]);
  const [savedFiles, setSavedFiles] = useState<IndexedFile[]>([]);
  const [mePageTab, setMePageTab] = useState<MePageTab>('all');
  const [, setIsLoadingSavedFiles] = useState(false);
  const [, setIsLoadingUserEngagement] = useState(false);
  const [creatorOverrideFiles, setCreatorOverrideFiles] = useState<IndexedFile[]>([]);

  // --- refs ---
  const savedFeedLoadingRef = useRef(false);
  const savedFeedErrorRef = useRef<{ timestamp: number; count: number } | null>(null);
  const lastSavedFeedFetchRef = useRef<{ userPnIdentifier: string; timestamp: number } | null>(null);
  const indexedFilesMapRef = useRef<Map<string, IndexedFile>>(new Map());
  const prevViewingCreatorIdRef = useRef<string | null>(null);
  const prevMePageTabRef = useRef<string>('all');
  const prevFilteredCountRef = useRef<number>(-1);
  const prevIsOwnIndexRef = useRef<boolean>(false);
  const creatorFilesLengthRef = useRef<number>(0);
  const userLikedFilesLengthRef = useRef<number>(0);
  const userCommentedFilesLengthRef = useRef<number>(0);
  const savedFilesLengthRef = useRef<number>(0);
  const filteredMeFilesLengthRef = useRef<number>(0);
  const filesStabilizedRef = useRef<boolean>(false);
  const prevFilteredMeFilesLengthRef = useRef<number>(0);
  const prevLengthForIndexResetRef = useRef<number>(0);
  const isNavigatingToFileRef = useRef<boolean>(false);
  const lastNavigatedFileIdRef = useRef<string | null>(null);
  const lastNavigatedFileIndexRef = useRef<number | null>(null);

  // --- computed keys and map ---
  const indexedFilesKey = useMemo(() => indexedFiles.map((f) => f.metadata.fileId).sort().join(','), [indexedFiles]);
  const indexedFilesMap = useMemo(() => {
    const currentKey = indexedFiles.map((f) => f.metadata.fileId).sort().join(',');
    const prevKey = Array.from(indexedFilesMapRef.current.keys()).sort().join(',');
    if (currentKey === prevKey && indexedFilesMapRef.current.size === indexedFiles.length) {
      indexedFiles.forEach((f) => indexedFilesMapRef.current.set(f.metadata.fileId, f));
      return indexedFilesMapRef.current;
    }
    const map = new Map<string, IndexedFile>();
    indexedFiles.forEach((f) => map.set(f.metadata.fileId, f));
    indexedFilesMapRef.current = map;
    return map;
  }, [indexedFilesKey, indexedFiles]);

  // --- creator files and helpers ---
  const creatorFiles = useMemo(() => {
    if (!viewingCreatorId) return EMPTY_ARRAY;
    const n = normalizeId(viewingCreatorId);
    const all = [...mediaFiles, ...thoughtsFiles, ...collectionsFiles];
    const fromDiscovery = all.filter((f) => {
      const id = getCreatorIdentifier(f);
      return id != null && normalizeId(id) === n;
    });
    const byId = new Map(fromDiscovery.map((f) => [f.metadata.fileId, f]));
    creatorOverrideFiles.forEach((f) => {
      if (!byId.has(f.metadata.fileId)) byId.set(f.metadata.fileId, f);
    });
    return Array.from(byId.values());
  }, [viewingCreatorId, mediaFiles, thoughtsFiles, collectionsFiles, creatorOverrideFiles]);

  const isOwnIndex = !!(viewingCreatorId === userState.pnIdentifier && userState.isUnlocked);

  function isThirdPartyContent(f: IndexedFile, viewingId: string): boolean {
    const full = indexedFilesMap.get(f.metadata.fileId) || f;
    const isPk = (id: string | undefined | null) => !!id && (id.trim().startsWith('MII') || id.trim().length > 100);
    const owner = getCreatorIdentifier(full) || getCreatorIdentifier(f);
    if (!owner || isPk(owner)) return true;
    return normalizeId(owner) !== normalizeId(viewingId);
  }

  const creatorMediaFiles = useMemo(() => creatorFiles.filter(isMedia), [creatorFiles]);
  const creatorThoughtsFiles = useMemo(() => creatorFiles.filter(isThought), [creatorFiles]);
  const creatorCollectionsFiles = useMemo(() => creatorFiles.filter(isCollection), [creatorFiles]);

  // --- saved feed load (Me tab only) ---
  useEffect(() => {
    if (!mePageActive || viewingCreatorId !== userState.pnIdentifier || !userState.isUnlocked || !userState.pnIdentifier) {
      setSavedFeedFileIds([]);
      setSavedFiles([]);
      savedFeedLoadingRef.current = false;
      savedFeedErrorRef.current = null;
      lastSavedFeedFetchRef.current = null;
      return;
    }
    if (savedFeedLoadingRef.current) return;
    if (savedFeedErrorRef.current) {
      const t = Date.now() - savedFeedErrorRef.current.timestamp;
      const delay = Math.min(30000 * Math.pow(2, savedFeedErrorRef.current.count), 300000);
      if (t < delay) return;
    }
    if (lastSavedFeedFetchRef.current?.userPnIdentifier === userState.pnIdentifier) {
      if (Date.now() - lastSavedFeedFetchRef.current.timestamp < 30000) return;
    }
    savedFeedLoadingRef.current = true;
    setIsLoadingSavedFiles(true);
    (async () => {
      try {
        if (!userState.pnIdentifier) return;
        const saved = await getSavedFeed(userState.pnIdentifier);
        setSavedFeedFileIds(saved?.fileIds?.length ? saved.fileIds : []);
        savedFeedErrorRef.current = null;
        lastSavedFeedFetchRef.current = { userPnIdentifier: userState.pnIdentifier, timestamp: Date.now() };
      } catch (e: any) {
        if (e?.status !== 500) console.error('Failed to load saved feed:', e);
        setSavedFeedFileIds([]);
        if (savedFeedErrorRef.current) {
          savedFeedErrorRef.current.count++;
          savedFeedErrorRef.current.timestamp = Date.now();
        } else savedFeedErrorRef.current = { timestamp: Date.now(), count: 1 };
      } finally {
        setIsLoadingSavedFiles(false);
        savedFeedLoadingRef.current = false;
      }
    })();
  }, [mePageActive, viewingCreatorId, userState.pnIdentifier, userState.isUnlocked]);

  // --- savedFeedFileIds + indexedFilesMap -> savedFiles ---
  const savedFeedFileIdsKey = useMemo(() => [...savedFeedFileIds].sort().join(','), [savedFeedFileIds]);
  useEffect(() => {
    if (savedFeedFileIds.length > 0 && indexedFilesMap.size > 0) {
      const arr = savedFeedFileIds
        .map((id) => indexedFilesMap.get(id))
        .filter((f): f is IndexedFile => f != null);
      setSavedFiles((p) => {
        const a = new Set(p.map((f) => f.metadata.fileId));
        const b = new Set(arr.map((f) => f.metadata.fileId));
        if (a.size === b.size && [...a].every((id) => b.has(id))) return p;
        return arr;
      });
    } else if (savedFeedFileIds.length === 0) setSavedFiles((p) => (p.length === 0 ? p : EMPTY_ARRAY));
  }, [savedFeedFileIdsKey, indexedFilesKey, savedFeedFileIds, indexedFilesMap]);

  // --- fetch creator's files by authorDid when on Me page (covers discovery pagination / timing) ---
  useEffect(() => {
    if (!viewingCreatorId) {
      setCreatorOverrideFiles([]);
      return;
    }
    const authorDid = viewingCreatorId.startsWith('pn-') ? viewingCreatorId : `pn-${viewingCreatorId}`;
    let cancelled = false;
    (async () => {
      try {
        const svc = getMetadataIndexService();
        const res = await svc.discoverFiles({ authorDid, limit: 150 }, false);
        const list = Array.isArray(res) ? res : (res as { files: IndexedFile[] }).files || [];
        if (!cancelled) setCreatorOverrideFiles(list);
      } catch {
        if (!cancelled) setCreatorOverrideFiles([]);
      }
    })();
    return () => { cancelled = true; };
  }, [viewingCreatorId]);

  // --- user engagement fileIds ---
  useEffect(() => {
    if (!viewingCreatorId || !userState.isUnlocked || !userState.pnIdentifier) {
      setUserLikedFileIds([]);
      setUserCommentedFileIds([]);
      setUserSharedFileIds([]);
      setUserLikedFiles([]);
      setUserCommentedFiles([]);
      setUserSharedFiles([]);
      return;
    }
    setIsLoadingUserEngagement(true);
    (async () => {
      try {
        const n = viewingCreatorId.startsWith('pn-') ? viewingCreatorId : `pn-${viewingCreatorId}`;
        const r = await fetch(`${API_ENDPOINT}/api/engagement/user/${encodeURIComponent(n)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (r.ok) {
          const d = await r.json();
          setUserLikedFileIds(d.likedFileIds || []);
          setUserCommentedFileIds(d.commentedFileIds || []);
          setUserSharedFileIds([]);
        } else {
          setUserLikedFileIds([]);
          setUserCommentedFileIds([]);
          setUserSharedFileIds([]);
        }
      } catch (e) {
        console.error('Failed to load user engagement:', e);
        setUserLikedFileIds([]);
        setUserCommentedFileIds([]);
        setUserSharedFileIds([]);
      } finally {
        setIsLoadingUserEngagement(false);
      }
    })();
  }, [viewingCreatorId, userState.pnIdentifier, userState.isUnlocked]);

  // --- engagement fileIds -> userLikedFiles, userCommentedFiles, userSharedFiles ---
  const ulKey = useMemo(() => [...userLikedFileIds].sort().join(','), [userLikedFileIds]);
  const ucKey = useMemo(() => [...userCommentedFileIds].sort().join(','), [userCommentedFileIds]);
  const usKey = useMemo(() => [...userSharedFileIds].sort().join(','), [userSharedFileIds]);
  useEffect(() => {
    if (indexedFilesMap.size === 0) {
      setUserLikedFiles((p) => (p.length === 0 ? p : EMPTY_ARRAY));
      setUserCommentedFiles((p) => (p.length === 0 ? p : EMPTY_ARRAY));
      setUserSharedFiles((p) => (p.length === 0 ? p : EMPTY_ARRAY));
      return;
    }
    const l = userLikedFileIds.map((id) => indexedFilesMap.get(id)).filter((f): f is IndexedFile => f != null);
    const c = userCommentedFileIds.map((id) => indexedFilesMap.get(id)).filter((f): f is IndexedFile => f != null);
    const s = userSharedFileIds.map((id) => indexedFilesMap.get(id)).filter((f): f is IndexedFile => f != null);
    setUserLikedFiles((p) => {
      const a = new Set(p.map((f) => f.metadata.fileId));
      const b = new Set(l.map((f) => f.metadata.fileId));
      if (a.size === b.size && [...a].every((id) => b.has(id))) return p;
      return l;
    });
    setUserCommentedFiles((p) => {
      const a = new Set(p.map((f) => f.metadata.fileId));
      const b = new Set(c.map((f) => f.metadata.fileId));
      if (a.size === b.size && [...a].every((id) => b.has(id))) return p;
      return c;
    });
    setUserSharedFiles((p) => {
      const a = new Set(p.map((f) => f.metadata.fileId));
      const b = new Set(s.map((f) => f.metadata.fileId));
      if (a.size === b.size && [...a].every((id) => b.has(id))) return p;
      return s;
    });
  }, [ulKey, ucKey, usKey, indexedFilesKey, userLikedFileIds, userCommentedFileIds, userSharedFileIds, indexedFilesMap]);

  // --- viewed user's liked/commented ---
  useEffect(() => {
    if (!viewingCreatorId || viewingCreatorId === userState.pnIdentifier) {
      setViewedUserLikedFiles((p) => (p.length === 0 ? p : []));
      setViewedUserCommentedFiles((p) => (p.length === 0 ? p : []));
      return;
    }
    (async () => {
      try {
        const n = viewingCreatorId.startsWith('pn-') ? viewingCreatorId : `pn-${viewingCreatorId}`;
        const r = await fetch(`${API_ENDPOINT}/api/engagement/user/${encodeURIComponent(n)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!r.ok) {
          setViewedUserLikedFiles((p) => (p.length === 0 ? p : []));
          setViewedUserCommentedFiles((p) => (p.length === 0 ? p : []));
          return;
        }
        const d = await r.json();
        const likedIds = d.likedFileIds || [];
        const commentedIds = d.commentedFileIds || [];
        const allLiked: IndexedFile[] = [];
        const allCommented: IndexedFile[] = [];
        if (likedIds.length > 0) {
          const mr = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
          if (mr.ok) {
            const md = await mr.json();
            if (Array.isArray(md.files)) {
              allLiked.push(
                ...md.files
                  .filter((e: any) => likedIds.includes(e.fileId))
                  .map((e: any) => ({
                    metadata: {
                      ...(e.metadata || {}),
                      fileId: e.fileId || e.metadata?.fileId,
                      creatorId: e.pnIdentifier || e.metadata?.creatorId,
                      creator: e.metadata?.creator || { identifier: { value: e.pnIdentifier } },
                      author: e.metadata?.author || { did: e.pnIdentifier },
                    },
                  })) as IndexedFile[]
              );
            }
          }
        }
        if (commentedIds.length > 0) {
          const mr = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
          if (mr.ok) {
            const md = await mr.json();
            if (Array.isArray(md.files)) {
              allCommented.push(
                ...md.files
                  .filter((e: any) => commentedIds.includes(e.fileId))
                  .map((e: any) => ({
                    metadata: {
                      ...(e.metadata || {}),
                      fileId: e.fileId || e.metadata?.fileId,
                      creatorId: e.pnIdentifier || e.metadata?.creatorId,
                      creator: e.metadata?.creator || { identifier: { value: e.pnIdentifier } },
                      author: e.metadata?.author || { did: e.pnIdentifier },
                    },
                  })) as IndexedFile[]
              );
            }
          }
        }
        const fromIdx = (ids: string[]) => indexedFiles.filter((f) => ids.includes(f.metadata.fileId));
        const combL = Array.from(new Map([...allLiked, ...fromIdx(likedIds)].map((f) => [f.metadata.fileId, f])).values());
        const combC = Array.from(new Map([...allCommented, ...fromIdx(commentedIds)].map((f) => [f.metadata.fileId, f])).values());
        setViewedUserLikedFiles((p) => {
          const a = new Set(p.map((f) => f.metadata.fileId));
          const b = new Set(combL.map((f) => f.metadata.fileId));
          if (a.size === b.size && [...a].every((id) => b.has(id))) return p;
          return combL;
        });
        setViewedUserCommentedFiles((p) => {
          const a = new Set(p.map((f) => f.metadata.fileId));
          const b = new Set(combC.map((f) => f.metadata.fileId));
          if (a.size === b.size && [...a].every((id) => b.has(id))) return p;
          return combC;
        });
      } catch (e) {
        console.error('Failed to load viewed user engagement:', e);
        setViewedUserLikedFiles((p) => (p.length === 0 ? p : []));
        setViewedUserCommentedFiles((p) => (p.length === 0 ? p : []));
      }
    })();
  }, [viewingCreatorId, userState.pnIdentifier, indexedFilesKey]);

  // --- connections + connectionTopPosts (Me tab only) ---
  useEffect(() => {
    if (!mePageActive || viewingCreatorId !== userState.pnIdentifier || !userState.pnIdentifier) {
      setConnectionsList([]);
      setConnectionTopPosts([]);
      return;
    }
    (async () => {
      try {
        const { getConnections } = await import('../services/connectionService');
        const conn = await getConnections(userState.pnIdentifier!);
        setConnectionsList(conn as ConnectionRow[]);
        const top: IndexedFile[] = [];
        const seen = new Set<string>();
        for (const c of conn) {
          // Connection.userPnIdentifier is the other user's identifier
          if (!c.userPnIdentifier) {
            console.warn('[useMePageData] Connection missing userPnIdentifier:', c);
            continue;
          }
          if (seen.has(c.userPnIdentifier)) continue;
          seen.add(c.userPnIdentifier);
          const owner = normalizeId(c.userPnIdentifier);
          const files = indexedFiles.filter((f) => normalizeId(getCreatorIdentifier(f) ?? '') === owner);
          const topPost = files.find((f) => f.metadata.isTopPost === true) ||
            files.sort((a, b) =>
              new Date(b.metadata.uploadDate || b.metadata.datePublished || 0).getTime() -
              new Date(a.metadata.uploadDate || a.metadata.datePublished || 0).getTime()
            )[0];
          if (topPost) top.push(topPost);
        }
        setConnectionTopPosts(top);
      } catch (e) {
        console.error('Failed to load connections:', e);
        setConnectionsList([]);
        setConnectionTopPosts([]);
      }
    })();
  }, [mePageActive, viewingCreatorId, userState.pnIdentifier, indexedFilesKey]);

  // --- filteredMeFiles ---
  const filteredMeFilesMemo = useMemo(() => {
    let filtered: IndexedFile[] = [];
    if (isOwnIndex) {
      const mediaF = creatorMediaFiles;
      const thoughtsF = creatorThoughtsFiles;
      const collectionsF = creatorCollectionsFiles;
      const likesF = userLikedFiles.filter((f) => isThirdPartyContent(f, viewingCreatorId!));
      const commentsF = userCommentedFiles.filter((f) => isThirdPartyContent(f, viewingCreatorId!));
      const sharesF = userSharedFiles.filter((f) => isThirdPartyContent(f, viewingCreatorId!));
      const savedF = savedFiles;
      const connF = connectionTopPosts;
      switch (mePageTab) {
        case 'all':
          filtered = [...mediaF, ...thoughtsF, ...collectionsF];
          break;
        case 'media': filtered = mediaF; break;
        case 'thoughts': filtered = thoughtsF; break;
        case 'collections': filtered = collectionsF; break;
        case 'likes': filtered = likesF; break;
        case 'comments': filtered = commentsF; break;
        case 'shares': filtered = sharesF; break;
        case 'saved': filtered = savedF; break;
        case 'connections': filtered = connF; break;
      }
      if (['all', 'media', 'thoughts', 'collections'].includes(mePageTab) && filtered.length > 0) {
        const i = filtered.findIndex((f) => f.metadata.isTopPost === true);
        if (i > 0) {
          const [top] = filtered.splice(i, 1);
          filtered = [top, ...filtered];
        }
      }
    } else if (viewingCreatorId) {
      const mediaF = creatorMediaFiles;
      const thoughtsF = creatorThoughtsFiles;
      const collectionsF = creatorCollectionsFiles;
      switch (mePageTab) {
        case 'all': filtered = [...mediaF, ...thoughtsF, ...collectionsF]; break;
        case 'media': filtered = mediaF; break;
        case 'thoughts': filtered = thoughtsF; break;
        case 'collections': filtered = collectionsF; break;
        case 'likes': filtered = viewedUserLikedFiles; break;
        case 'comments': filtered = viewedUserCommentedFiles; break;
        default: filtered = creatorFiles;
      }
      if (['all', 'media', 'thoughts', 'collections'].includes(mePageTab) && filtered.length > 0) {
        const i = filtered.findIndex((f) => f.metadata.isTopPost === true);
        if (i > 0) {
          const [top] = filtered.splice(i, 1);
          filtered = [top, ...filtered];
        }
      }
    }
    if (mePageTab === 'all' && userState.isUnlocked) {
      const order = userState.preferences.mePageSortOrder || 'recommended';
      if (order === 'time') {
        filtered = [...filtered].sort((a, b) =>
          (b.metadata.uploadDate ? new Date(b.metadata.uploadDate).getTime() : 0) -
          (a.metadata.uploadDate ? new Date(a.metadata.uploadDate).getTime() : 0)
        );
      } else if (order === 'most_viewed') {
        filtered = [...filtered].sort((a, b) =>
          (b.metadata.engagement?.views || 0) - (a.metadata.engagement?.views || 0)
        );
      } else {
        const sc = (f: IndexedFile) =>
          (f.metadata as any).recommendationScore ??
          ((f.metadata.engagement?.likes || 0) + (f.metadata.engagement?.comments || 0) + (f.metadata.engagement?.shares || 0) + (f.metadata.engagement?.views || 0) * 0.1);
        filtered = [...filtered].sort((a, b) => sc(b) - sc(a));
      }
    }
    return filtered;
  }, [
    isOwnIndex, mePageTab, creatorMediaFiles, creatorThoughtsFiles, creatorCollectionsFiles,
    userLikedFiles, userCommentedFiles, userSharedFiles, savedFiles, connectionTopPosts,
    viewedUserLikedFiles, viewedUserCommentedFiles, viewingCreatorId, indexedFilesMap, creatorFiles,
    userState.isUnlocked, userState.preferences.mePageSortOrder,
  ]);

  // --- length refs and logging ---
  useEffect(() => {
    creatorFilesLengthRef.current = creatorFiles.length;
    userLikedFilesLengthRef.current = userLikedFiles.length;
    userCommentedFilesLengthRef.current = userCommentedFiles.length;
    savedFilesLengthRef.current = savedFiles.length;
    filteredMeFilesLengthRef.current = filteredMeFilesMemo.length;
  }, [creatorFiles, userLikedFiles, userCommentedFiles, savedFiles, filteredMeFilesMemo]);

  useEffect(() => {
    const cur = filteredMeFilesLengthRef.current;
    const countCh = cur !== prevFilteredCountRef.current;
    const creatorCh = viewingCreatorId !== prevViewingCreatorIdRef.current;
    const ownCh = isOwnIndex !== prevIsOwnIndexRef.current;
    const tabCh = mePageTab !== prevMePageTabRef.current;
    if (viewingCreatorId && (countCh || creatorCh || ownCh || tabCh)) {
      prevFilteredCountRef.current = cur;
      prevViewingCreatorIdRef.current = viewingCreatorId;
      prevIsOwnIndexRef.current = isOwnIndex;
      prevMePageTabRef.current = mePageTab;
    }
  }, [viewingCreatorId, isOwnIndex, mePageTab]);

  const filteredMeFiles = filteredMeFilesMemo;

  // --- filesStabilizedRef + prevLengthForIndexReset ---
  useEffect(() => {
    if (filteredMeFilesMemo.length !== prevFilteredMeFilesLengthRef.current) {
      filesStabilizedRef.current = false;
      prevFilteredMeFilesLengthRef.current = filteredMeFilesMemo.length;
      const t = setTimeout(() => { filesStabilizedRef.current = true; }, 500);
      return () => clearTimeout(t);
    }
    filesStabilizedRef.current = true;
  }, [filteredMeFilesMemo.length]);

  // --- reset currentFeedIndex when filteredMeFiles length changes ---
  useEffect(() => {
    const pl = prevLengthForIndexResetRef.current;
    const cl = filteredMeFiles.length;
    if (pl !== cl) {
      prevLengthForIndexResetRef.current = cl;
      const cur = filteredMeFiles;
      setCurrentFeedIndex((pi) => {
        if (cl > 0) return (pi >= cl || !cur[pi]) ? 0 : pi;
        return pi !== 0 ? 0 : pi;
      });
    }
  }, [filteredMeFiles.length, setCurrentFeedIndex]);

  // --- find-file effect ---
  useEffect(() => {
    if (!visibleFileId || !viewingCreatorId) {
      isNavigatingToFileRef.current = false;
      if (viewingCreatorId && filesStabilizedRef.current && currentFeedIndex !== 0 && filteredMeFiles.length > 0)
        setCurrentFeedIndex(0);
      return;
    }
    if (!isNavigatingToFileRef.current && mePageTab !== prevMePageTabRef.current) return;
    isNavigatingToFileRef.current = true;

    const findAndSetFileIndex = (): boolean => {
      if (!isNavigatingToFileRef.current && !visibleFileId) return false;
      const curCreator = creatorFiles;
      const curOwn = viewingCreatorId === userState.pnIdentifier && userState.isUnlocked;
      let cur: IndexedFile[] = [];
      if (curOwn) {
        switch (mePageTab) {
          case 'all':
            cur = Array.from(new Map([...curCreator, ...userLikedFiles, ...userCommentedFiles].map((f) => [f.metadata.fileId, f])).values());
            break;
          case 'media': cur = curCreator.filter(isMedia); break;
          case 'thoughts': cur = curCreator.filter(isThought); break;
          case 'likes': cur = userLikedFiles.filter((f) => normalizeId(getCreatorIdentifier(f) ?? '') !== normalizeId(viewingCreatorId!)); break;
          case 'comments': cur = userCommentedFiles.filter((f) => normalizeId(getCreatorIdentifier(f) ?? '') !== normalizeId(viewingCreatorId!)); break;
          case 'saved': cur = savedFiles; break;
          case 'connections': cur = connectionTopPosts; break;
          default: break;
        }
      } else if (viewingCreatorId) {
        switch (mePageTab) {
          case 'all': cur = Array.from(new Map([...curCreator, ...viewedUserLikedFiles, ...viewedUserCommentedFiles].map((f) => [f.metadata.fileId, f])).values()); break;
          case 'media': cur = curCreator.filter(isMedia); break;
          case 'thoughts': cur = curCreator.filter(isThought); break;
          case 'likes': cur = viewedUserLikedFiles; break;
          case 'comments': cur = viewedUserCommentedFiles; break;
          default: cur = curCreator;
        }
      }
      if (['all', 'media', 'thoughts'].includes(mePageTab) && cur.length > 0) {
        const i = cur.findIndex((f) => f.metadata.isTopPost === true);
        if (i > 0) { const [tp] = cur.splice(i, 1); cur = [tp, ...cur]; }
      }
      const idx = cur.findIndex((f) => f.metadata.fileId === visibleFileId);
      if (idx !== -1) {
        if (currentFeedIndex !== idx) setCurrentFeedIndex(idx);
        lastNavigatedFileIdRef.current = visibleFileId;
        lastNavigatedFileIndexRef.current = idx;
        setTimeout(() => {
          isNavigatingToFileRef.current = false;
          setVisibleFileId(null);
          setTimeout(() => { lastNavigatedFileIdRef.current = null; lastNavigatedFileIndexRef.current = null; }, 1000);
        }, 1000);
        return true;
      }
      if (!isNavigatingToFileRef.current || !visibleFileId) return false;
      if (mePageTab !== 'collections' && curCreator.length > 0) {
        const cf = curCreator.filter(isCollection);
        const i = cf.findIndex((f) => f.metadata.fileId === visibleFileId);
        if (i !== -1) {
          setMePageTab('collections');
          if (currentFeedIndex !== i) setCurrentFeedIndex(i);
          lastNavigatedFileIdRef.current = visibleFileId;
          lastNavigatedFileIndexRef.current = i;
          setTimeout(() => { isNavigatingToFileRef.current = false; setVisibleFileId(null); setTimeout(() => { lastNavigatedFileIdRef.current = null; lastNavigatedFileIndexRef.current = null; }, 1000); }, 1000);
          return true;
        }
      }
      if (mePageTab !== 'thoughts' && curCreator.length > 0) {
        const tf = curCreator.filter(isThought);
        const i = tf.findIndex((f) => f.metadata.fileId === visibleFileId);
        if (i !== -1) {
          setMePageTab('thoughts');
          if (currentFeedIndex !== i) setCurrentFeedIndex(i);
          lastNavigatedFileIdRef.current = visibleFileId;
          lastNavigatedFileIndexRef.current = i;
          setTimeout(() => { isNavigatingToFileRef.current = false; setVisibleFileId(null); setTimeout(() => { lastNavigatedFileIdRef.current = null; lastNavigatedFileIndexRef.current = null; }, 1000); }, 1000);
          return true;
        }
      }
      if (curCreator.length > 0) {
        let mf = [...curCreator];
        const ti = mf.findIndex((f) => f.metadata.isTopPost === true);
        if (ti > 0) { const [tp] = mf.splice(ti, 1); mf = [tp, ...mf]; }
        const i = mf.findIndex((f) => f.metadata.fileId === visibleFileId);
        if (i !== -1) {
          setMePageTab('media');
          if (currentFeedIndex !== i) setCurrentFeedIndex(i);
          lastNavigatedFileIdRef.current = visibleFileId;
          lastNavigatedFileIndexRef.current = i;
          setTimeout(() => { isNavigatingToFileRef.current = false; setVisibleFileId(null); setTimeout(() => { lastNavigatedFileIdRef.current = null; lastNavigatedFileIndexRef.current = null; }, 1000); }, 1000);
          return true;
        }
      }
      const all = curOwn
        ? Array.from(new Map([...curCreator, ...userLikedFiles, ...userCommentedFiles].map((f) => [f.metadata.fileId, f])).values())
        : Array.from(new Map([...curCreator, ...viewedUserLikedFiles, ...viewedUserCommentedFiles].map((f) => [f.metadata.fileId, f])).values());
      let ap = [...all];
      const tai = ap.findIndex((f) => f.metadata.isTopPost === true);
      if (tai > 0) { const [tp] = ap.splice(tai, 1); ap = [tp, ...ap]; }
      const ai = ap.findIndex((f) => f.metadata.fileId === visibleFileId);
      if (ai !== -1) {
        setMePageTab('all');
        if (currentFeedIndex !== ai) setCurrentFeedIndex(ai);
        lastNavigatedFileIdRef.current = visibleFileId;
        lastNavigatedFileIndexRef.current = ai;
        setTimeout(() => { isNavigatingToFileRef.current = false; setVisibleFileId(null); setTimeout(() => { lastNavigatedFileIdRef.current = null; lastNavigatedFileIndexRef.current = null; }, 1000); }, 1000);
        return true;
      }
      return false;
    };

    if (findAndSetFileIndex()) return;
    let retries = 0;
    const max = 10;
    const iv = 200;
    const t = setInterval(() => {
      retries++;
      if (findAndSetFileIndex() || retries >= max) {
        clearInterval(t);
        if (retries >= max) {
          isNavigatingToFileRef.current = false;
          setTimeout(() => setVisibleFileId(null), 100);
        }
      }
    }, iv);
    return () => { clearInterval(t); isNavigatingToFileRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentFeedIndex intentionally omitted
  }, [visibleFileId, viewingCreatorId, mePageTab, mediaFiles, thoughtsFiles, collectionsFiles, userState.pnIdentifier, userState.isUnlocked, userLikedFiles, userCommentedFiles, viewedUserLikedFiles, viewedUserCommentedFiles, savedFiles, connectionTopPosts, creatorFiles]);

  // --- refreshSavedFeed for onSave onComplete ---
  const refreshSavedFeed = async () => {
    if (!userState.pnIdentifier) return;
    try {
      const s = await getSavedFeed(userState.pnIdentifier);
      if (s?.fileIds?.length) {
        setSavedFeedFileIds(s.fileIds);
        savedFeedErrorRef.current = null;
        lastSavedFeedFetchRef.current = { userPnIdentifier: userState.pnIdentifier, timestamp: Date.now() };
      }
    } catch {}
  };

  return {
    creatorFiles,
    isOwnIndex,
    filteredMeFiles,
    connectionsList,
    connectionTopPosts,
    savedFiles,
    savedFeedFileIds,
    setSavedFeedFileIds,
    userLikedFiles,
    userCommentedFiles,
    userSharedFiles,
    viewedUserLikedFiles,
    viewedUserCommentedFiles,
    mePageTab,
    setMePageTab,
    prevViewingCreatorIdRef,
    isNavigatingToFileRef,
    lastNavigatedFileIdRef,
    lastNavigatedFileIndexRef,
    refreshSavedFeed,
    savedFeedErrorRef,
    lastSavedFeedFetchRef,
  };
}
