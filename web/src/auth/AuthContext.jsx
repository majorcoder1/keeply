import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import client, { getToken, setToken } from '../api/client'
import { createSecureStore } from '../data/secureStore'
import localStore from '../data/localStore'
import { checkKey, cleanCode, deriveKey, deriveLogin, generateCode, isValidCode, makeKeyCheck, newSalt } from '../lib/crypto'
import { forgetDeviceKey, loadDeviceKey, saveDeviceKey } from '../lib/keystore'

const AuthContext = createContext(null)
const GUEST_KEY = 'keeply_guest'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [guest, setGuest] = useState(() => localStorage.getItem(GUEST_KEY) === '1')
  const [loading, setLoading] = useState(true)
  // This device's copy of the encryption key, once it has one ('checking' while we look).
  const [cryptoKey, setCryptoKey] = useState(null)
  const [keyState, setKeyState] = useState('checking') // checking | ready | locked | none
  // Finishing two-factor setup shows the recovery codes first; the app moves on after that.
  const pendingUser = useRef(null)
  // A key just made or typed on this device: use it as is, rather than reading it back.
  const freshKey = useRef(null)
  // The 24-digit number typed to log in, held only until the authenticator step is done, so the
  // notes can open at the same moment. Never stored.
  const pendingNumber = useRef(null)

  // On boot: if we have a token, fetch the current user to confirm it's valid.
  useEffect(() => {
    let active = true
    async function boot() {
      if (getToken()) {
        try {
          const { data } = await client.get('/user')
          if (active) setUser(data)
        } catch {
          setToken(null)
        }
      }
      if (active) setLoading(false)
    }
    boot()
    return () => {
      active = false
    }
  }, [])

  // If a request 401s, drop the user back to the sign-in screen.
  useEffect(() => {
    const onUnauth = () => setUser(null)
    window.addEventListener('keeply:unauthorized', onUnauth)
    return () => window.removeEventListener('keeply:unauthorized', onUnauth)
  }, [])

  // Whenever the account (or its key) changes, find out whether this device holds the key.
  const salt = user?.key_salt || null
  const hasKeyOnServer = !!user?.key_set
  const userId = user?.id
  useEffect(() => {
    let active = true
    if (!userId) { setCryptoKey(null); setKeyState('checking'); return () => { active = false } }
    if (!hasKeyOnServer) { setCryptoKey(null); setKeyState('none'); return () => { active = false } }
    const fresh = freshKey.current
    if (fresh && fresh.userId === userId && fresh.salt === salt) {
      setCryptoKey(fresh.key)
      setKeyState('ready')
      return () => { active = false }
    }
    setCryptoKey(null)
    setKeyState('checking')
    ;(async () => {
      const saved = await loadDeviceKey(userId, salt)
      const good = saved && (await checkKey(saved, user.key_check))
      if (!active) return
      if (good) { setCryptoKey(saved); setKeyState('ready') } else setKeyState('locked')
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, hasKeyOnServer, salt])

  const startSession = useCallback((data) => {
    setToken(data.token)
    setUser(data.user)
    setGuest(false)
    localStorage.removeItem(GUEST_KEY)
  }, [])

  const register = useCallback(async (name, email, password) => {
    const { data } = await client.post('/register', { name, email, password })
    startSession(data)
  }, [startSession])

  // Returns { twoFactor: true, challenge } when a code is needed; otherwise signs in.
  const login = useCallback(async (email, password) => {
    pendingNumber.current = null
    const { data } = await client.post('/login', { email, password })
    if (data.two_factor) return { twoFactor: true, challenge: data.challenge }
    startSession(data)
    return { twoFactor: false }
  }, [startSession])

  // Open this device's notes with a number just used to log in (the same check as typing it in
  // the unlock screen). Wrong or missing, the person simply lands on the unlock screen instead.
  const openWithNumber = useCallback(async (account, number) => {
    if (!number || !account?.key_salt || !account.key_check) return
    try {
      const key = await deriveKey(number, account.key_salt)
      if (!(await checkKey(key, account.key_check))) return
      await saveDeviceKey(account.id, key, account.key_salt)
      freshKey.current = { userId: account.id, salt: account.key_salt, key }
    } catch {
      /* fall back to the unlock screen */
    }
  }, [])

  // Log in with the 24-digit number. Same shape as login(): a code may still be needed.
  const loginWithNumber = useCallback(async (number) => {
    if (!isValidCode(number)) throw Object.assign(new Error('bad number'), { response: { data: { errors: { number: ['Type all 24 digits.'] } } } })
    const { data } = await client.post('/login/number', await deriveLogin(number))
    if (data.two_factor) {
      pendingNumber.current = cleanCode(number)
      return { twoFactor: true, challenge: data.challenge }
    }
    await openWithNumber(data.user, number)
    startSession(data)
    return { twoFactor: false }
  }, [startSession, openWithNumber])

  const completeTwoFactor = useCallback(async ({ challenge, code, recoveryCode }) => {
    const { data } = await client.post('/two-factor/challenge', {
      challenge,
      ...(recoveryCode ? { recovery_code: recoveryCode } : { code }),
    })
    const number = pendingNumber.current
    pendingNumber.current = null
    await openWithNumber(data.user, number)
    startSession(data)
  }, [startSession, openWithNumber])

  const logout = useCallback(async () => {
    try {
      await client.post('/logout')
    } catch {
      /* ignore network errors on logout */
    }
    pendingNumber.current = null
    setToken(null)
    setUser(null)
  }, [])

  const changePassword = useCallback(async (password) => {
    await client.post('/password', { password })
  }, [])

  // Send a password-reset email (generic response — never reveals if the email exists).
  const forgotPassword = useCallback(async (email) => {
    await client.post('/forgot-password', { email })
  }, [])

  // Complete a reset using the token from the emailed link.
  const resetPassword = useCallback(async ({ token, email, password }) => {
    await client.post('/reset-password', { token, email, password })
  }, [])

  const continueAsGuest = useCallback(() => {
    setGuest(true)
    localStorage.setItem(GUEST_KEY, '1')
  }, [])

  const exitGuest = useCallback(() => {
    setGuest(false)
    localStorage.removeItem(GUEST_KEY)
  }, [])

  // ---- two-factor setup ----------------------------------------------------------------
  const startTwoFactorSetup = useCallback(async () => {
    const { data } = await client.post('/two-factor/setup')
    return data // { secret, otpauth }
  }, [])

  // Returns the recovery codes. The app stays on the setup screen until finishTwoFactorSetup().
  const confirmTwoFactor = useCallback(async (code) => {
    const { data } = await client.post('/two-factor/confirm', { code })
    pendingUser.current = data.user
    return data.recovery_codes
  }, [])

  const finishTwoFactorSetup = useCallback(() => {
    if (pendingUser.current) setUser(pendingUser.current)
    pendingUser.current = null
  }, [])

  const newRecoveryCodes = useCallback(async (code) => {
    const { data } = await client.post('/two-factor/recovery-codes', { code })
    return data.recovery_codes
  }, [])

  // ---- the encryption key ----------------------------------------------------------------
  // The 24 digits are made here, on this device, and never sent anywhere. Only a random
  // salt and a small "key check" go to the server.
  const makeKeyCode = useCallback(() => generateCode(), [])

  const saveNewKey = useCallback(async (code) => {
    const keySalt = newSalt()
    const key = await deriveKey(code, keySalt)
    // The two one-way login values let the same number sign in later. They are not the key.
    const { data } = await client.post('/key', { salt: keySalt, check: await makeKeyCheck(key), ...(await deriveLogin(code)) })
    await saveDeviceKey(data.id, key, keySalt)
    freshKey.current = { userId: data.id, salt: keySalt, key }
    setCryptoKey(key)
    setKeyState('ready')
    setUser(data)
  }, [])

  // Typing the 24 digits on a new device. Returns false when they don't match.
  const unlockWithCode = useCallback(async (code) => {
    if (!user?.key_salt || !isValidCode(code)) return false
    const key = await deriveKey(code, user.key_salt)
    if (!(await checkKey(key, user.key_check))) return false
    await saveDeviceKey(user.id, key, user.key_salt)
    freshKey.current = { userId: user.id, salt: user.key_salt, key }
    setCryptoKey(key)
    setKeyState('ready')
    // An account made before number login existed gets it now, while the digits are in hand.
    if (!user.number_set) {
      deriveLogin(code)
        .then((login) => client.put('/key/number', login))
        .then(({ data }) => setUser(data))
        .catch(() => {})
    }
    return true
  }, [user])

  // Turn on number login for an account that has a key but not this yet (it was made before number
  // login existed), from a device that already has the key. The person types their 24 digits once.
  const enableNumberLogin = useCallback(async (code) => {
    if (!user?.key_salt || !isValidCode(code)) return false
    const key = await deriveKey(code, user.key_salt)
    if (!(await checkKey(key, user.key_check))) return false
    const { data } = await client.put('/key/number', await deriveLogin(code))
    setUser(data)
    return true
  }, [user])

  const forgetThisDevice = useCallback(async () => {
    if (user) await forgetDeviceKey(user.id)
    freshKey.current = null
    setCryptoKey(null)
    setKeyState('locked')
  }, [user])

  // "I lost my key": erases the account's notes and starts over with a new key.
  const startOver = useCallback(async (password) => {
    const { data } = await client.post('/key/reset', { password })
    await forgetDeviceKey(data.id)
    freshKey.current = null
    setCryptoKey(null)
    setUser(data)
    setKeyState('none')
  }, [])

  // ---- profile picture -----------------------------------------------------------------------
  // The image is uploaded locked (store.uploadImage); this remembers which one it is.
  const saveAvatar = useCallback(async (url) => {
    const { data } = await client.put('/avatar', { url })
    setUser(data)
  }, [])

  const removeAvatar = useCallback(async () => {
    const { data } = await client.delete('/avatar')
    setUser(data)
  }, [])

  // The single source of truth for data access. UI just calls store.notes() etc.
  // Signed in, that is the encrypting store — it exists only once this device has the key.
  const secureStore = useMemo(() => (cryptoKey ? createSecureStore(cryptoKey) : null), [cryptoKey])
  const store = user ? secureStore : localStore

  const value = useMemo(
    () => ({
      user,
      guest,
      loading,
      store,
      keyState,
      isAuthed: !!user,
      register,
      login,
      loginWithNumber,
      completeTwoFactor,
      logout,
      changePassword,
      forgotPassword,
      resetPassword,
      continueAsGuest,
      exitGuest,
      startTwoFactorSetup,
      confirmTwoFactor,
      finishTwoFactorSetup,
      newRecoveryCodes,
      makeKeyCode,
      saveNewKey,
      unlockWithCode,
      enableNumberLogin,
      forgetThisDevice,
      startOver,
      saveAvatar,
      removeAvatar,
    }),
    [user, guest, loading, store, keyState, register, login, loginWithNumber, completeTwoFactor, logout, changePassword, forgotPassword, resetPassword, continueAsGuest, exitGuest, startTwoFactorSetup, confirmTwoFactor, finishTwoFactorSetup, newRecoveryCodes, makeKeyCode, saveNewKey, unlockWithCode, enableNumberLogin, forgetThisDevice, startOver, saveAvatar, removeAvatar]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
