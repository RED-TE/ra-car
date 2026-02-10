# -*- coding: utf-8 -*-
"""
RealCar Bot - Firebase 로그 수집 시스템
관리자 대시보드와 연동되는 실행 로그 추적
"""

import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import platform
import uuid
import sys
import traceback

class RicarLogger:
    """
    RealCar Bot 실행 로그 수집 클래스
    
    사용법:
        logger = RicarLogger(user_id="user123", hwid="ABC...")
        logger.log_step("로그인 중")
        logger.log_step("블로그 작성 중")
        logger.log_success()
    """
    
    def __init__(self, user_id, hwid, firebase_credentials_path="serviceAccountKey.json"):
        """
        초기화
        
        Args:
            user_id: Firebase Auth UID 또는 고유 사용자 ID
            hwid: 하드웨어 ID
            firebase_credentials_path: Firebase 인증 파일 경로
        """
        self.user_id = user_id
        self.hwid = hwid
        self.start_time = datetime.now()
        self.current_step = "시작"
        self.steps_history = []
        
        # Firebase 초기화 (이미 초기화되어 있으면 건너뜀)
        try:
            if not firebase_admin._apps:
                cred = credentials.Certificate(firebase_credentials_path)
                firebase_admin.initialize_app(cred)
            self.db = firestore.client()
            print("✅ Firebase 연결 성공")
        except Exception as e:
            print(f"❌ Firebase 연결 실패: {e}")
            self.db = None
    
    def log_step(self, step_name):
        """
        현재 단계 기록
        
        Args:
            step_name: 단계 이름 (예: "로그인 중", "블로그 작성 중")
        """
        self.current_step = step_name
        self.steps_history.append({
            'step': step_name,
            'timestamp': datetime.now()
        })
        print(f"[LOG] {step_name}")
    
    def log_success(self):
        """작업 성공 시 호출"""
        duration = (datetime.now() - self.start_time).total_seconds()
        print(f"✅ 작업 완료 (소요 시간: {duration:.2f}초)")
        self._save_log(status="success", error=None)
        self._increment_execution_count()
    
    def log_error(self, error_message=None):
        """
        작업 실패 시 호출
        
        Args:
            error_message: 에러 메시지 (선택사항)
        """
        if error_message is None:
            error_message = traceback.format_exc()
        
        duration = (datetime.now() - self.start_time).total_seconds()
        print(f"❌ 작업 실패: {error_message}")
        self._save_log(status="error", error=error_message)
    
    def _save_log(self, status, error=None):
        """
        Firestore에 로그 저장 (내부 메서드)
        
        Args:
            status: "success" 또는 "error"
            error: 에러 메시지 (선택사항)
        """
        if not self.db:
            print("⚠️ Firebase 미연결 - 로그 저장 건너뜀")
            return
        
        try:
            user_ref = self.db.collection('users').document(self.user_id)
            
            # 로그 엔트리 생성
            log_entry = {
                'timestamp': datetime.now(),
                'hwid': self.hwid,
                'lastStep': self.current_step,
                'status': status,
                'duration': (datetime.now() - self.start_time).total_seconds(),
                'platform': f"{platform.system()} {platform.release()}",
                'stepsHistory': [s['step'] for s in self.steps_history]
            }
            
            if error:
                # 에러 메시지는 500자로 제한
                log_entry['error'] = error[:500]
            
            # Firestore 업데이트
            user_ref.update({
                'executionLogs': firestore.ArrayUnion([log_entry]),
                'lastExecutionLog': log_entry,
                'totalExecutions': firestore.Increment(1),
                'updatedAt': datetime.now()
            })
            
            print(f"✅ 로그 저장 완료: {status}")
            
        except Exception as e:
            print(f"❌ 로그 저장 실패: {e}")
    
    def _increment_execution_count(self):
        """총 실행 횟수 증가 (내부 메서드)"""
        if not self.db:
            return
        
        try:
            user_ref = self.db.collection('users').document(self.user_id)
            user_ref.update({
                'totalExecutions': firestore.Increment(1)
            })
        except Exception as e:
            print(f"❌ 실행 횟수 업데이트 실패: {e}")


class FreeTrialManager:
    """
    무료 체험 관리 클래스
    
    사용법:
        manager = FreeTrialManager(user_id="user123")
        if manager.check_free_trial_limit():
            # 실행 계속
        else:
            # 제한 초과
    """
    
    def __init__(self, user_id, firebase_credentials_path="serviceAccountKey.json"):
        """
        초기화
        
        Args:
            user_id: Firebase Auth UID 또는 고유 사용자 ID
            firebase_credentials_path: Firebase 인증 파일 경로
        """
        self.user_id = user_id
        
        # Firebase 초기화
        try:
            if not firebase_admin._apps:
                cred = credentials.Certificate(firebase_credentials_path)
                firebase_admin.initialize_app(cred)
            self.db = firestore.client()
        except Exception as e:
            print(f"❌ Firebase 연결 실패: {e}")
            self.db = None
    
    def check_free_trial_limit(self, max_count=1):
        """
        무료 체험 제한 확인
        
        Args:
            max_count: 최대 허용 횟수 (기본 1회)
        
        Returns:
            True: 실행 가능
            False: 제한 초과
        """
        if not self.db:
            print("⚠️ Firebase 미연결 - 제한 체크 건너뜀")
            return True
        
        try:
            user_ref = self.db.collection('users').document(self.user_id)
            user_doc = user_ref.get()
            
            if not user_doc.exists:
                print("⚠️ 사용자 정보 없음 - 신규 사용자")
                # 신규 사용자 생성
                user_ref.set({
                    'createdAt': datetime.now(),
                    'plan': 'free',
                    'planName': 'FREE',
                    'freeTrialCount': 0,
                    'totalExecutions': 0
                })
                return True
            
            data = user_doc.to_dict()
            plan = data.get('plan', 'free')
            free_count = data.get('freeTrialCount', 0)
            
            # 유료 플랜이면 제한 없음
            if plan != 'free' and plan:
                print(f"✅ 유료 플랜 ({plan}) - 제한 없음")
                return True
            
            # 무료 플랜 제한 체크
            if free_count >= max_count:
                print(f"❌ 무료 체험 제한 초과: {free_count}회 (최대 {max_count}회)")
                return False
            
            # 제한 이내 - 카운트 증가
            user_ref.update({
                'freeTrialCount': firestore.Increment(1)
            })
            
            print(f"✅ 무료 체험 {free_count + 1}/{max_count}회")
            return True
            
        except Exception as e:
            print(f"❌ 무료 체험 체크 실패: {e}")
            return True  # 에러 시 실행 허용
    
    def get_user_info(self):
        """
        사용자 정보 조회
        
        Returns:
            dict: 사용자 정보
        """
        if not self.db:
            return None
        
        try:
            user_ref = self.db.collection('users').document(self.user_id)
            user_doc = user_ref.get()
            
            if user_doc.exists:
                return user_doc.to_dict()
            return None
            
        except Exception as e:
            print(f"❌ 사용자 정보 조회 실패: {e}")
            return None


def get_hardware_id():
    """
    하드웨어 ID 생성
    
    Returns:
        str: 고유 하드웨어 ID
    """
    try:
        # MAC 주소 기반 ID
        mac = uuid.getnode()
        return str(uuid.UUID(int=mac))
    except Exception as e:
        print(f"❌ HWID 생성 실패: {e}")
        return str(uuid.uuid4())


# ==========================================
# 사용 예시
# ==========================================

def example_usage():
    """실제 사용 예시"""
    
    # 1. 사용자 ID 및 HWID 가져오기
    user_id = "user_unique_id_here"  # Firebase Auth UID 또는 고유 ID
    hwid = get_hardware_id()
    
    # 2. 무료 체험 제한 체크
    trial_manager = FreeTrialManager(user_id)
    
    if not trial_manager.check_free_trial_limit(max_count=1):
        print("⛔ 무료 체험 제한 초과!")
        print("유료 플랜 구매가 필요합니다.")
        sys.exit(1)
    
    # 3. 로거 초기화
    logger = RicarLogger(user_id, hwid)
    
    try:
        # 4. 각 단계마다 로그 기록
        logger.log_step("프로그램 시작")
        
        logger.log_step("로그인 진행 중")
        # 로그인 로직...
        
        logger.log_step("네이버 접속 중")
        # 네이버 접속...
        
        logger.log_step("블로그 작성 중")
        # 블로그 작성...
        
        logger.log_step("이미지 업로드 중")
        # 이미지 업로드...
        
        logger.log_step("발행 완료")
        
        # 5. 성공 로그
        logger.log_success()
        
        print("=" * 50)
        print("✅ 모든 작업 완료!")
        print("=" * 50)
        
    except Exception as e:
        # 6. 에러 로그
        logger.log_error(str(e))
        print(f"❌ 작업 실패: {e}")
        sys.exit(1)


if __name__ == "__main__":
    # 테스트 실행
    example_usage()
