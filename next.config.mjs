/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{
      source: "/shortcuts/add-ourpool-expense.shortcut",
      headers: [
        { key: "Content-Type", value: "application/octet-stream" },
        { key: "Content-Disposition", value: 'attachment; filename="Add OurPool Expense.shortcut"' },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
};

export default nextConfig;
