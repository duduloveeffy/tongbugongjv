import "@/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import AuthProvider from "@/components/auth/AuthProvider";

export const metadata: Metadata = {
	title: "ERP数据分析系统 - 库存分析与销量检测",
	description: "专业的ERP数据分析工具，支持库存分析、销量检测、WooCommerce集成等功能",
	icons: [
		{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" },
		{ rel: "icon", url: "/favicon.ico" },
		{ rel: "apple-touch-icon", url: "/favicon.svg" }
	],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${geist.variable}`}>
			<body>
				<AuthProvider>
					{children}
				</AuthProvider>
				<Toaster position="top-center" richColors />
			</body>
		</html>
	);
}
