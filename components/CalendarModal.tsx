import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal,
  Pressable, StyleSheet, Linking, PanResponder,
} from 'react-native';
import { Colors } from '../constants/theme';
import { getDateKey, getPrayerDataForDate } from '../hooks/usePrayerTimes';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_HEADERS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const PRAYER_TIMES_URL = 'https://eeis.co.uk/prayer-times';

type Props = {
  visible: boolean;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onClose: () => void;
  fontsLoaded: boolean;
};

function buildCalendarWeeks(year: number, month: number): (number | null)[][] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay    = new Date(year, month, 1).getDay(); // 0=Sun … 6=Sat

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDay).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

export function CalendarModal({ visible, selectedDate, onSelectDate, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'      : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold'  : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'   : undefined;

  const [displayMonth, setDisplayMonth] = useState(selectedDate.getMonth());
  const [displayYear]                   = useState(2026); // data year
  const displayMonthRef                 = useRef(displayMonth);
  displayMonthRef.current               = displayMonth;

  // Re-sync to selectedDate's month each time the modal opens
  useEffect(() => {
    if (visible) setDisplayMonth(selectedDate.getMonth());
  }, [visible]);

  const todayKey    = getDateKey(new Date());
  const selectedKey = getDateKey(selectedDate);

  const weeks = buildCalendarWeeks(displayYear, displayMonth);

  const canGoPrev = displayMonth > 0;
  const canGoNext = displayMonth < 11;

  // Month swipe gesture
  const monthPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 12 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -50 && displayMonthRef.current < 11) {
          setDisplayMonth(m => m + 1);
        } else if (gs.dx > 50 && displayMonthRef.current > 0) {
          setDisplayMonth(m => m - 1);
        }
      },
    })
  ).current;

  const openPrayerTimes = () => Linking.openURL(PRAYER_TIMES_URL);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>

          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Text style={[styles.closeBtnText, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>

          {/* Hint above month navigator */}
          <Text style={[styles.hintAbove, { fontFamily: reg }]}>
            Tap the month title to view the full timetable
          </Text>

          {/* Month navigator */}
          <View style={styles.monthNav}>
            <TouchableOpacity
              style={[styles.navArrow, !canGoPrev && styles.navArrowDisabled]}
              onPress={() => canGoPrev && setDisplayMonth(m => m - 1)}
              disabled={!canGoPrev}
            >
              <Text style={[styles.navArrowText, { fontFamily: bold }, !canGoPrev && styles.navArrowTextDisabled]}>
                ◀
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={openPrayerTimes} style={styles.monthLabelBtn}>
              <Text style={[styles.monthLabel, { fontFamily: bold }]}>
                {MONTH_NAMES[displayMonth]} {displayYear}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navArrow, !canGoNext && styles.navArrowDisabled]}
              onPress={() => canGoNext && setDisplayMonth(m => m + 1)}
              disabled={!canGoNext}
            >
              <Text style={[styles.navArrowText, { fontFamily: bold }, !canGoNext && styles.navArrowTextDisabled]}>
                ▶
              </Text>
            </TouchableOpacity>
          </View>

          {/* Swipeable calendar grid */}
          <View {...monthPan.panHandlers}>
            {/* Day-of-week header */}
            <View style={styles.weekRow}>
              {DAY_HEADERS.map((d, i) => (
                <View key={d} style={styles.dayCell}>
                  <Text style={[styles.dayHeader, { fontFamily: semi }, i === 5 && styles.fridayHeader]}>
                    {d}
                  </Text>
                </View>
              ))}
            </View>

            {/* Calendar weeks */}
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={styles.dayCell} />;

                  const date     = new Date(displayYear, displayMonth, day);
                  const key      = getDateKey(date);
                  const isToday  = key === todayKey;
                  const isSel    = key === selectedKey;
                  const hasData  = !!getPrayerDataForDate(date);
                  const isFriday = date.getDay() === 5;

                  return (
                    <TouchableOpacity
                      key={di}
                      style={styles.dayCell}
                      onPress={() => { if (hasData) { onSelectDate(date); onClose(); } }}
                      disabled={!hasData}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.dayInner,
                        isSel     && styles.dayInnerSelected,
                        isToday && !isSel && styles.dayInnerToday,
                        isFriday && !isSel && !isToday && styles.dayInnerFriday,
                      ]}>
                        <Text style={[
                          styles.dayText,
                          { fontFamily: isFriday || isSel || isToday ? bold : reg },
                          isFriday && !isSel && styles.dayTextFriday,
                          isToday && !isSel && styles.dayTextToday,
                          isSel && styles.dayTextSelected,
                          !hasData && styles.dayTextDisabled,
                        ]}>
                          {day}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Hint below */}
          <Text style={[styles.hintBelow, { fontFamily: reg }]}>
            Tap a date · Swipe between months to navigate to a specific day · Tap the month title to see the complete month's prayer times
          </Text>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const CELL = 38;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6,57,104,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    width: '100%',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    padding: 6,
  },
  closeBtnText: {
    fontSize: 16,
    color: Colors.inkMute,
    fontWeight: '700',
  },
  hintAbove: {
    fontSize: 10,
    color: Colors.inkMute,
    textAlign: 'center',
    marginBottom: 4,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  navArrow: {
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  navArrowDisabled: { opacity: 0.25 },
  navArrowText: {
    fontSize: 22,
    color: Colors.deepBlue,
    fontWeight: '700',
  },
  navArrowTextDisabled: { color: Colors.inkMute },
  monthLabelBtn: { flex: 1, alignItems: 'center' },
  monthLabel: {
    fontSize: 17,
    color: Colors.maroonRed,
    fontWeight: '700',
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeader: {
    fontSize: 11,
    color: Colors.inkMute,
    fontWeight: '600',
  },
  fridayHeader: {
    color: Colors.maroonRed,
    fontWeight: '700',
  },
  dayInner: {
    width: CELL - 4,
    height: CELL - 4,
    borderRadius: (CELL - 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInnerSelected: {
    backgroundColor: Colors.deepBlue,
  },
  dayInnerToday: {
    borderWidth: 2,
    borderColor: Colors.freshGreen,
  },
  dayInnerFriday: {
    borderWidth: 2,
    borderColor: Colors.maroonRed,
  },
  dayText: {
    fontSize: 14,
    color: Colors.ink,
  },
  dayTextFriday: {
    color: Colors.maroonRed,
    fontWeight: '700',
  },
  dayTextToday: {
    color: Colors.freshGreen,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayTextDisabled: {
    color: '#D0D0D0',
  },
  hintBelow: {
    marginTop: 10,
    fontSize: 10,
    color: Colors.inkMute,
    textAlign: 'center',
    lineHeight: 15,
  },
});
