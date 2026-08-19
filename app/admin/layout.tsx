import RequireAdmin from "@/app/components/RequireAdmin";
import AdminNav from "./AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <div className="flex min-h-screen bg-bg">
        <AdminNav />
        <main className="flex-1 p-8">
          <div className="mx-auto w-full max-w-[1000px]">{children}</div>
        </main>
      </div>
    </RequireAdmin>
  );
}
