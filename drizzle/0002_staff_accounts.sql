CREATE TABLE `staff_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(320) NOT NULL,
  `name` varchar(120) NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `role` enum('admin','staff') NOT NULL DEFAULT 'staff',
  `isActive` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `staff_accounts_id` PRIMARY KEY(`id`),
  CONSTRAINT `staff_accounts_email_unique` UNIQUE(`email`)
);
