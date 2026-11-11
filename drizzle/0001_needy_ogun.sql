CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`customerName` varchar(120) NOT NULL,
	`address` text NOT NULL,
	`itemsJson` text NOT NULL,
	`deliveryEnabled` int NOT NULL DEFAULT 0,
	`shippingRegion` varchar(32),
	`shippingAmount` int NOT NULL DEFAULT 0,
	`totalAmount` int NOT NULL DEFAULT 0,
	`handedOver` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
