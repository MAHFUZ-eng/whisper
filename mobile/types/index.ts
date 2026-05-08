export interface User {
  _id: string;
  name: string;
  email: string;
  avatar: string;
  lastSeen?: string;
}

export interface MessageSender {
  _id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
}

export interface ReplyTo {
  _id: string;
  text: string;
  senderName: string;
}

export interface Message {
  _id: string;
  chat: string;
  sender: MessageSender | string;
  text: string;
  replyTo?: ReplyTo;
  isDeleted?: boolean;
  reactions?: MessageReaction[];
  type?: "text" | "system";
  createdAt: string;
  updatedAt: string;
}

export interface ChatLastMessage {
  _id: string;
  text: string;
  sender: string;
  createdAt: string;
}

export interface Chat {
  _id: string;
  participant: MessageSender;
  lastMessage: ChatLastMessage | null;
  lastMessageAt: string;
  createdAt: string;
}