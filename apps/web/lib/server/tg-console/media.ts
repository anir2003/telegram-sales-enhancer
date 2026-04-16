function getClassName(value: any) {
  return typeof value?.className === 'string' ? value.className : '';
}

function toSafeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (value && typeof (value as { toJSNumber?: () => number }).toJSNumber === 'function') {
    const next = (value as { toJSNumber: () => number }).toJSNumber();
    return Number.isFinite(next) ? next : null;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function getDocumentAttributes(document: any) {
  return Array.isArray(document?.attributes) ? document.attributes : [];
}

function getFileNameAttribute(attributes: any[]) {
  return attributes.find((attribute) => getClassName(attribute) === 'DocumentAttributeFilename')?.fileName ?? null;
}

function getStickerAttribute(attributes: any[]) {
  return attributes.find((attribute) => getClassName(attribute) === 'DocumentAttributeSticker') ?? null;
}

function getSizedAttribute(attributes: any[]) {
  return attributes.find((attribute) => ['DocumentAttributeImageSize', 'DocumentAttributeVideo'].includes(getClassName(attribute))) ?? null;
}

function getAudioAttribute(attributes: any[]) {
  return attributes.find((attribute) => getClassName(attribute) === 'DocumentAttributeAudio') ?? null;
}

function hasAnimatedAttribute(attributes: any[]) {
  return attributes.some((attribute) => getClassName(attribute) === 'DocumentAttributeAnimated');
}

function compactMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

export function buildTgMessageMediaMetadata(message: any): Record<string, unknown> {
  const media = message?.media;
  if (!media) return { media: false };

  const mediaClass = getClassName(media);
  if (mediaClass === 'MessageMediaPhoto') {
    return {
      media: true,
      media_kind: 'photo',
      file_name: 'Photo',
      mime_type: 'image/jpeg',
    };
  }

  if (mediaClass === 'MessageMediaDocument') {
    const document = media.document;
    const attributes = getDocumentAttributes(document);
    const mimeType = typeof document?.mimeType === 'string' ? document.mimeType : null;
    const sticker = getStickerAttribute(attributes);
    const fileName = getFileNameAttribute(attributes);
    const sized = getSizedAttribute(attributes);
    const audio = getAudioAttribute(attributes);
    const isSticker = Boolean(sticker) || mimeType === 'application/x-tgsticker';
    const mediaKind = isSticker
      ? 'sticker'
      : mimeType?.startsWith('image/')
        ? 'image'
        : mimeType?.startsWith('video/')
          ? 'video'
          : mimeType?.startsWith('audio/')
            ? (audio?.voice ? 'voice' : 'audio')
            : 'document';

    return compactMetadata({
      media: true,
      media_kind: mediaKind,
      file_name: fileName || (isSticker ? 'Sticker' : mediaKind[0].toUpperCase() + mediaKind.slice(1)),
      mime_type: mimeType,
      file_size: toSafeNumber(document?.size),
      sticker_alt: typeof sticker?.alt === 'string' ? sticker.alt : null,
      sticker_animated: isSticker && (mimeType === 'application/x-tgsticker' || hasAnimatedAttribute(attributes)),
      width: toSafeNumber(sized?.w),
      height: toSafeNumber(sized?.h),
      duration: toSafeNumber(sized?.duration ?? audio?.duration),
    });
  }

  if (mediaClass === 'MessageMediaContact') {
    return compactMetadata({
      media: true,
      media_kind: 'contact',
      file_name: [media.firstName, media.lastName].filter(Boolean).join(' ').trim() || 'Contact',
    });
  }

  if (mediaClass === 'MessageMediaGeo' || mediaClass === 'MessageMediaGeoLive') {
    return { media: true, media_kind: 'location', file_name: 'Location' };
  }

  if (mediaClass === 'MessageMediaPoll') {
    return { media: true, media_kind: 'poll', file_name: 'Poll' };
  }

  if (mediaClass === 'MessageMediaDice') {
    return compactMetadata({
      media: true,
      media_kind: 'dice',
      file_name: 'Dice',
      sticker_alt: typeof media.emoticon === 'string' ? media.emoticon : null,
    });
  }

  return { media: true, media_kind: mediaClass || 'media', file_name: 'Media attachment' };
}

export function getTgMessagePreview(message: any) {
  const text = typeof message?.message === 'string' ? message.message.trim() : '';
  if (text) return text.length > 180 ? `${text.slice(0, 177)}...` : text;

  const metadata = buildTgMessageMediaMetadata(message);
  if (!metadata.media) return '';
  const stickerAlt = typeof metadata.sticker_alt === 'string' ? metadata.sticker_alt : '';
  const mediaKind = typeof metadata.media_kind === 'string' ? metadata.media_kind : 'media';
  if (mediaKind === 'sticker') return stickerAlt ? `Sticker ${stickerAlt}` : 'Sticker';
  if (mediaKind === 'photo') return 'Photo';
  if (mediaKind === 'video') return 'Video';
  if (typeof metadata.file_name === 'string') return metadata.file_name;
  return 'Media attachment';
}
