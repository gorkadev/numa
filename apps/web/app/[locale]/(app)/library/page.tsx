import { LibraryPage } from "@/components/library-page"
import { readFirstLibraryPage } from "@/lib/library-queries"

export default async function Page() {
  return <LibraryPage firstPage={await readFirstLibraryPage()} />
}
