import React, { useState, useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { supabase } from './lib/supabase'
import { Session } from '@supabase/supabase-js'

import LoginScreen from './screens/LoginScreen'
import ExamsListScreen from './screens/ExamsListScreen'
import ExamDetailScreen from './screens/ExamDetailScreen'
import ScannerScreen from './screens/ScannerScreen'
import CalibrationScreen from './screens/CalibrationScreen'
import TestScannerScreen from './screens/TestScannerScreen'

const Stack = createNativeStackNavigator()

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return null
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {session ? (
          <>
            <Stack.Screen name="ExamsList" component={ExamsListScreen} />
            <Stack.Screen
              name="ExamDetail"
              component={ExamDetailScreen}
              options={{ headerShown: true, title: 'Exam Details' }}
            />
            <Stack.Screen
              name="Scanner"
              component={ScannerScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Calibration"
              component={CalibrationScreen}
              options={{ headerShown: true, title: 'Calibrate Scanner' }}
            />
            <Stack.Screen
              name="TestScanner"
              component={TestScannerScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
