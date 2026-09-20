'use client'

// Account menu — centered settings window. Profile, preferences, and calendar connections.
import { useState, useEffect } from 'react'
import { X, Settings, User as UserIcon, Shield, ChevronDown, Pencil, Search, LogOut, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/components/theme-provider'
import type { User } from '@supabase/supabase-js'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { openStripePortal } from '@/lib/stripe-client'
import {
  isPaidSubscriptionTier,
  subscriptionTierLabel,
} from '@/lib/subscription-plans'
import { OpenMojiImg } from '@/components/openmoji-picker'
import { EditProfileDialog } from '@/components/edit-profile-dialog'
import { AccountConnections } from '@/components/account-connections'
import { DEFAULT_AVATAR_COLOR, resolveAvatarColor } from '@/lib/avatar-colors'

type AccountSection = 'profile' | 'preferences' | 'security' | 'connections'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  user: User
  onDeleteAccount: () => void
  isDeleting: boolean
  showDeleteConfirm: boolean
  onShowDeleteConfirm: (show: boolean) => void
  onLogout: () => void // Profile menu Log out now lives in this menu
  initialSection?: AccountSection // Profile opens on profile; OAuth return opens Connections
}

export function SettingsPanel({
  open,
  onClose,
  user,
  onDeleteAccount,
  isDeleting,
  showDeleteConfirm,
  onShowDeleteConfirm,
  onLogout,
  initialSection = 'profile',
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<AccountSection>(initialSection)
  const [navQuery, setNavQuery] = useState('') // Filters the left-hand sections
  const { theme, setTheme } = useTheme()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [editProfileOpen, setEditProfileOpen] = useState(false) // Standalone Edit profile window
  
  // Fetch user profile (avatar emoji + color live in metadata)
  const { data: profile } = useQuery({
    queryKey: ['user-profile', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email, subscription_tier, metadata')
        .eq('id', user.id)
        .single()
      
      if (error) {
        console.error('Error fetching profile:', error)
        return null
      }
      return data
    },
  })
  
  const [displayName, setDisplayName] = useState(profile?.full_name || '')
  const meta = (profile?.metadata && typeof profile.metadata === 'object' ? profile.metadata : {}) as Record<string, unknown>
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(
    typeof meta.avatar_emoji === 'string' ? meta.avatar_emoji : null
  )
  const [avatarUnified, setAvatarUnified] = useState<string | null>(
    typeof meta.avatar_unified === 'string' ? meta.avatar_unified : null
  )
  const [avatarColor, setAvatarColor] = useState(
    resolveAvatarColor(typeof meta.avatar_color === 'string' ? meta.avatar_color : null)
  )
  
  // Update local state when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.full_name || '')
      const m = (profile.metadata && typeof profile.metadata === 'object' ? profile.metadata : {}) as Record<string, unknown>
      setAvatarEmoji(typeof m.avatar_emoji === 'string' ? m.avatar_emoji : null)
      setAvatarUnified(typeof m.avatar_unified === 'string' ? m.avatar_unified : null)
      setAvatarColor(resolveAvatarColor(typeof m.avatar_color === 'string' ? m.avatar_color : null))
    }
  }, [profile, user.email])

  // Jump to the section the profile button (or OAuth return) asked for
  useEffect(() => {
    if (open) setActiveTab(initialSection)
  }, [open, initialSection])

  const profileInitials =
    profile?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() ||
    user.email?.charAt(0).toUpperCase() ||
    'U'

  if (!open) return null

  const navItems: { id: AccountSection; label: string; group: string; icon: typeof UserIcon }[] = [
    { id: 'profile', label: 'Profile', group: 'Account', icon: UserIcon },
    { id: 'preferences', label: 'Preferences', group: 'Account', icon: Settings },
    { id: 'security', label: 'Security', group: 'Account', icon: Shield },
    { id: 'connections', label: 'Connections', group: 'Features', icon: Link2 },
  ]
  const q = navQuery.trim().toLowerCase()
  const visibleNav = q ? navItems.filter((item) => item.label.toLowerCase().includes(q)) : navItems
  const groups = ['Account', 'Features'].filter((group) => visibleNav.some((item) => item.group === group))

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[55]" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-[56] flex h-[min(760px,92vh)] w-[min(1040px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex w-60 shrink-0 flex-col border-r border-gray-200 dark:border-gray-700">
          <div className="p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder="Search settings"
                className="h-8 pl-8 text-sm dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-2">
            {groups.map((group) => (
              <div key={group}>
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{group}</p>
                <div className="space-y-0.5">
                  {visibleNav
                    .filter((item) => item.group === group)
                    .map((item) => {
                      const Icon = item.icon
                      const selected = activeTab === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                            selected
                              ? 'bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-white'
                              : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 p-2 dark:border-gray-700">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 h-8 w-8"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="flex-1 overflow-y-auto p-8 pr-14">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 dark:text-white">Profile</h3>
                  
                  {/* Avatar preview — pencil opens Edit profile window */}
                  <div className="flex flex-col items-center mb-6">
                    <div className="relative">
                      <button
                        type="button"
                        className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden ring-offset-2 hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600 transition"
                        style={{ backgroundColor: avatarColor || DEFAULT_AVATAR_COLOR }}
                        onClick={() => setEditProfileOpen(true)}
                        aria-label="Edit profile picture"
                      >
                        {avatarEmoji || avatarUnified ? (
                          <OpenMojiImg
                            native={avatarEmoji}
                            unified={avatarUnified}
                            size={72}
                            className="h-[72px] w-[72px]"
                            alt="Profile emoji"
                          />
                        ) : (
                          <span className="text-white font-semibold text-2xl">{profileInitials}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="absolute bottom-0 right-0 w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-600 transition-colors"
                        onClick={() => setEditProfileOpen(true)}
                        aria-label="Edit profile"
                      >
                        <Pencil className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  </div>

                  <EditProfileDialog
                    open={editProfileOpen}
                    onOpenChange={setEditProfileOpen}
                    initials={profileInitials}
                    initial={{
                      emoji: avatarEmoji,
                      unified: avatarUnified,
                      color: avatarColor,
                    }}
                    onSave={async (value) => {
                      setAvatarEmoji(value.emoji)
                      setAvatarUnified(value.unified)
                      setAvatarColor(value.color)
                      const prevMeta =
                        profile?.metadata && typeof profile.metadata === 'object'
                          ? (profile.metadata as Record<string, unknown>)
                          : {}
                      const { error } = await supabase
                        .from('profiles')
                        .update({
                          metadata: {
                            ...prevMeta,
                            avatar_emoji: value.emoji,
                            avatar_unified: value.unified,
                            avatar_color: value.color,
                          },
                        })
                        .eq('id', user.id)
                      if (error) {
                        console.error('Error updating avatar:', error)
                        throw error
                      }
                      await queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] })
                    }}
                  />
                  
                  {/* Display Name Input */}
                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Display name</label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your display name"
                      className="dark:bg-gray-800 dark:border-gray-700"
                    />
                  </div>
                  
                  {/* Description */}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                    Your profile helps people recognize you. Your display name is used across Nod Notes.
                  </p>
                  
                  {/* Save/Cancel Buttons */}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={onClose}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={async () => {
                        // Name save only — avatar emoji/color already persist from Edit profile window
                        const prevMeta =
                          profile?.metadata && typeof profile.metadata === 'object'
                            ? (profile.metadata as Record<string, unknown>)
                            : {}
                        const nextMeta = {
                          ...prevMeta,
                          avatar_emoji: avatarEmoji,
                          avatar_unified: avatarUnified,
                          avatar_color: avatarColor,
                        }
                        const { error } = await supabase
                          .from('profiles')
                          .update({ full_name: displayName, metadata: nextMeta })
                          .eq('id', user.id)
                        
                        if (error) {
                          console.error('Error updating profile:', error)
                        } else {
                          await queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] })
                          onClose()
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                  
                  <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold mb-4 dark:text-white">Account</h3>
                    
                    {/* User Info */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{user.email}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan</label>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {subscriptionTierLabel(profile?.subscription_tier)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Section */}
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">Payment</h4>
                        <p className="text-sm text-gray-500 mt-1">Manage your subscription</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (isPaidSubscriptionTier(profile?.subscription_tier)) {
                            void openStripePortal()
                          } else {
                            window.location.href = '/pricing'
                          }
                        }}
                      >
                        {isPaidSubscriptionTier(profile?.subscription_tier) ? 'Manage' : 'Upgrade'}
                      </Button>
                    </div>
                  </div>

                  {/* Delete Account Section */}
                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">Delete account</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Permanently delete your account and all associated data
                        </p>
                      </div>
                      {showDeleteConfirm ? (
                        <div className="space-y-3">
                          <p className="text-sm text-red-600 font-medium">
                            Are you sure? This action cannot be undone.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={onDeleteAccount}
                              disabled={isDeleting}
                            >
                              {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onShowDeleteConfirm(false)}
                              disabled={isDeleting}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onShowDeleteConfirm(true)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'preferences' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold dark:text-white">Preferences</h3>
                
                {/* Theme Option */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between text-left font-normal"
                      >
                        <span className="capitalize">{theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}</span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-full">
                      <DropdownMenuItem
                        onClick={() => setTheme('light')}
                        className={theme === 'light' ? 'bg-gray-100' : ''}
                      >
                        Light
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setTheme('dark')}
                        className={theme === 'dark' ? 'bg-gray-100' : ''}
                      >
                        Dark
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setTheme('system')}
                        className={theme === 'system' ? 'bg-gray-100' : ''}
                      >
                        System
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Choose your preferred theme. System will match your device settings.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'connections' && <AccountConnections />}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold dark:text-white">Security</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Security settings coming soon...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}



