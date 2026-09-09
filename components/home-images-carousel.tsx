'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type CarouselImage = { src: string; alt: string }

/** Horizontal strip of small images that drifts right→left as the page scrolls. */
export function HomeImagesCarousel({
  images,
  className,
}: {
  images: CarouselImage[]
  className?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const lastScrollY = useRef(0)

  useEffect(() => {
    const track = trackRef.current
    if (!track || images.length === 0) return

    lastScrollY.current = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      const dy = y - lastScrollY.current
      lastScrollY.current = y
      // Scroll down → move strip left; scroll up → reverse
      offsetRef.current += dy * 0.45
      const loopWidth = track.scrollWidth / 2
      if (loopWidth > 0) {
        offsetRef.current = ((offsetRef.current % loopWidth) + loopWidth) % loopWidth
      }
      track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [images.length])

  if (images.length === 0) return null

  // Repeat so the strip feels dense; duplicate once more for a seamless loop
  const dense = [...images, ...images, ...images, ...images]
  const loop = [...dense, ...dense]

  return (
    <div className={cn('shrink-0 overflow-hidden', className)}>
      <div
        ref={trackRef}
        className="flex w-max gap-2 will-change-transform"
        aria-hidden
      >
        {loop.map((image, i) => (
          <div
            key={`${image.src}-${i}`}
            className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 border-gray-700 bg-muted/30 shadow-lg min-[900px]:h-16 min-[900px]:w-24"
          >
            <Image
              src={image.src}
              alt=""
              fill
              sizes="96px"
              className="object-cover"
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
