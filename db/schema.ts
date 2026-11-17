import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const readingDocuments = sqliteTable("reading_documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  passageId: text("passage_id").notNull().default(""),
  body: text("body").notNull(),
  questions: text("questions").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const unknownWords = sqliteTable(
  "unknown_words",
  {
    userId: text("user_id").notNull(),
    normalized: text("normalized").notNull(),
    display: text("display").notNull(),
    clickCount: integer("click_count").notNull().default(1),
    contexts: text("contexts").notNull().default("[]"),
    documentIds: text("document_ids").notNull().default("[]"),
    firstClickedAt: integer("first_clicked_at").notNull(),
    lastClickedAt: integer("last_clicked_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.normalized] })],
);

export const readingAnswers = sqliteTable(
  "reading_answers",
  {
    userId: text("user_id").notNull(),
    documentId: text("document_id").notNull(),
    questionNumber: integer("question_number").notNull(),
    selectedOption: text("selected_option").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.documentId, table.questionNumber] })],
);
