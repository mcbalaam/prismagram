import type { ApiMessage, ApiMessageEntity, ApiMessageEntityTypes } from '../api/types';
import type { MessageEntity, MessageEntityType, MessageMedia, MessageMediaType, PluginMessage } from './types';

const ENTITY_TYPE_MAP: Partial<Record<string, MessageEntityType>> = {
  MessageEntityBold: 'bold',
  MessageEntityItalic: 'italic',
  MessageEntityCode: 'code',
  MessageEntityPre: 'pre',
  MessageEntityUrl: 'url',
  MessageEntityTextUrl: 'url',
  MessageEntityMention: 'mention',
  MessageEntityMentionName: 'mention',
  MessageEntityHashtag: 'hashtag',
  MessageEntitySpoiler: 'spoiler',
};

function normalizeEntity(entity: ApiMessageEntity): MessageEntity | undefined {
  const mappedType = ENTITY_TYPE_MAP[entity.type];
  if (!mappedType) return undefined;
  return { type: mappedType, offset: entity.offset, length: entity.length };
}

function normalizeMedia(content: ApiMessage['content']): MessageMedia | undefined {
  if (content.photo) return { type: 'photo' };
  if (content.video) return { type: 'video' };
  if (content.audio) return { type: 'audio' };
  if (content.document) return { type: 'document' };
  if (content.sticker) return { type: 'sticker' };
  if (content.voice) return { type: 'voice' };
  return undefined;
}

export function normalizeMessage(message: ApiMessage): PluginMessage {
  const { content } = message;
  const textObj = content.text;

  const entities = textObj?.entities
    ?.map(normalizeEntity)
    .filter((e): e is MessageEntity => e !== undefined);

  const replyToMessageId = message.replyInfo && 'replyToMsgId' in message.replyInfo
    ? message.replyInfo.replyToMsgId
    : undefined;

  return {
    id: message.id,
    chatId: Number(message.chatId),
    fromId: Number(message.senderId ?? '0'),
    text: textObj?.text ?? '',
    date: message.date,
    isOutgoing: message.isOutgoing,
    replyToMessageId,
    media: normalizeMedia(content),
    entities: entities?.length ? entities : undefined,
    raw: message,
  };
}
