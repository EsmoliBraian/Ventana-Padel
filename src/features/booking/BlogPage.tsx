import { useMemo } from 'react'
import { useSlidesStore } from '@/store/slidesStore'
import { BlogPostCard } from '@/components/BlogPostCard'
import { AdSlot } from '@/components/site/ads/AdSlot'

export function BlogPage() {
  const slides = useSlidesStore((s) => s.slides).filter((s) => s.published)
  const sortedSlides = useMemo(() => [...slides].sort((a, b) => a.order - b.order), [slides])

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">Blog</p>
      <h1 className="mt-1 text-3xl font-semibold text-gray-50 sm:text-4xl">Novedades</h1>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sortedSlides.map((post) => (
          <BlogPostCard key={post.id} post={post} />
        ))}
        <AdSlot placement="grillas" />
      </div>
      {sortedSlides.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">Todavia no hay posts publicados.</p>
      )}
    </div>
  )
}
